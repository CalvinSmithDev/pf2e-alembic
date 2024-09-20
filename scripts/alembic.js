import { Formulas } from './formulas.js';
import { AlembicSettings } from './settings.js';

class Alembic extends Application {
  // Singleton instance to ensure only one tracker exists
  static instance = null;

  // Constructor initializes properties and sets up time checks
  constructor(options = {}) {
    super(options);
    // Initialize tracker properties
    this.currentVials = 0;            // Current number of Versatile Vials
    this.spawnedItems = [];           // Items added to the character's inventory
    this.items = [];                  // Items pending to be added to the inventory
    this.lastCheckedTime = game.time.worldTime; // Last time the ten-minute check was performed
    this.setupTimeCheck();            // Set up the time check for vials
    this.originalSize = { width: options.width, height: options.height }; // Original window size
    this.maximizedSize = null;        // Stores the maximized window size when minimized
    this.isMinimized = false;         // Add this line to track minimized state
  }

  // Define default options for the application window
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("myModule.alembic.name"), // Window title
      template: "modules/pf2e-alembic/templates/alembic.html", // Path to HTML template
      width: 265,
      height: 550,
      left: 0,
      resizable: true,
      popOut: true,
      minimizable: true
    });
  }

  // Implement singleton pattern to ensure only one instance exists
  static getInstance() {
    if (!this.instance) {
      this.instance = new this();
    }
    return this.instance;
  }

  // Prepare data for the Handlebars template
  getData(options = {}) {
    const data = super.getData(options);
    const actor = game.user.character;
    let intMod = 0;

    if (actor) {
      // Get intelligence modifier from the actor
      intMod = actor.system.abilities?.int?.mod ?? 0;
      this.updateCurrentVials(actor);
    }

    // Use the settings for maxVials and maxItems
    const settings = AlembicSettings.getSettings();
    const maxVials = settings.versatileVials || (intMod + 2);
    const maxItems = settings.dailyPreparations || (intMod + 4);
    // Return data object for the template
    return {
      intMod,
      maxVials,
      currentVials: this.currentVials,
      items: this.items,
      spawnedItems: this.spawnedItems,
      maxItems
    };
  }

  // Helper method to get the active character or notify if none found
  getActiveCharacter() {
    const actor = game.user.character;
    if (!actor) {
      ui.notifications.warn("No active character found.");
      return null;
    }
    return actor;
  }

  // Helper method to find the Versatile Vial in the actor's inventory
  findVersatileVial(actor) {
    return actor.items.find(i =>
      i.name === "Versatile Vial" ||
      i.flags.core?.sourceId === "Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus"
    );
  }

  // Update the current number of vials based on actor's inventory
  updateCurrentVials(actor) {
    const versatileVial = this.findVersatileVial(actor);
    if (versatileVial) {
      this.currentVials = versatileVial.system.quantity;
    } else {
      this.currentVials = 0;
    }
  }

  // Override render method to update vial count and set up toggle button
  render(force = false, options = {}) {
    const rendered = super.render(force, options);

    // Update the vial count in both minimized and maximized views
    this.updateVialCount();
    this.updateDailyPreparationsCount();

    return rendered;
  }

  // Set up event listeners for UI interactions
  activateListeners(html) {
    super.activateListeners(html);

    // Button event listeners
    html.find('#useVial').click(this._onUseVial.bind(this));
    html.find('#addVial').click(this._onAddVial.bind(this));
    html.find('#addItem').click(this._onAddItem.bind(this));
    html.find('#openFormulaBook').click(this._onOpenFormulaBook.bind(this));

    // Drag-and-drop event listeners
    const dropZone = html.find('#itemDropZone')[0];
    dropZone.addEventListener('dragover', this._onDragOver.bind(this));
    dropZone.addEventListener('dragleave', this._onDragLeave.bind(this));
    dropZone.addEventListener('drop', this._onDrop.bind(this));
  }

  // Handle dragover event for item drop zone
  _onDragOver(event) {
    event.preventDefault();
    event.target.classList.add('dragover');
  }

  // Handle dragleave event for item drop zone
  _onDragLeave(event) {
    event.target.classList.remove('dragover');
  }

  // Handle drop event for adding items to the tracker
  async _onDrop(event) {
    event.preventDefault();
    event.target.classList.remove('dragover');

    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));

      if (data.type === 'Item' || data.isFormula) {
        const item = await fromUuid(data.uuid);
        if (item) {
          const itemName = item.name;
          let itemUuid = data.uuid;

          // If it's a formula, get the crafted item UUID
          if (data.isFormula && item.type !== 'consumable') {
            const craftedItemUuid = item.system.craftedItem?.uuid;
            if (craftedItemUuid) {
              itemUuid = craftedItemUuid;
            }
          }

          this._addItem(itemName, itemUuid);
        }
      } else {
        // console.log("Dropped item is not a recognized type. Data:", data);
      }
    } catch (error) {
      // console.error("Error processing dropped item:", error);
    }
  }

  // Add an item to the tracker
  async _addItem(name, uuid) {
    if (!name || !uuid) return;

    const { maxItems } = this.getData();
    if (this.items.length + this.spawnedItems.length < maxItems) {
      const uniqueId = Date.now() + Math.random().toString(36).substr(2, 9);
      const item = await fromUuid(uuid);
      const isAlchemical = item.isAlchemical ?? false;

      this.items.push({ id: uniqueId, name, uuid, isAlchemical });
      this.render();
      this.updateDailyPreparationsCount();
    } else {
      ui.notifications.warn(`Maximum number of items (${maxItems}) reached!`);
    }
  }

  // Handle using a vial
  async _onUseVial(event) {
    event.preventDefault();
    if (this.currentVials > 0) {
      this.currentVials--;
      await this.updateVersatileVials(-1);
      this.sendChatMessage(game.i18n.localize("myModule.alembic.chat.removedVial"));
      this.updateVialCount();
    } else {
      ui.notifications.warn(game.i18n.localize("myModule.alembic.notifications.noVials"));
    }
  }

  // Handle adding a vial
  async _onAddVial(event) {
    event.preventDefault();
    const { maxVials } = this.getData();
    if (this.currentVials < maxVials) {
      this.currentVials++;
      await this.updateVersatileVials(1);
      this.sendChatMessage("Added a Versatile Vial.");
      this.updateVialCount();
    } else {
      ui.notifications.warn(`Maximum number of vials (${maxVials}) reached!`);
    }
  }

  // Handle adding items to the actor's inventory
  async _onAddItem(event) {
    event.preventDefault();
    const actor = this.getActiveCharacter();
    if (!actor) return;

    if (this.items.length === 0) {
      ui.notifications.warn("No items to add to inventory.");
      return;
    }

    const { maxItems } = this.getData();
    const availableSlots = maxItems - this.spawnedItems.length;
    const itemsToProcess = this.items.slice(0, availableSlots);

    const itemsToAdd = [];
    const itemsToUpdate = [];

    // Group items by name and type
    const groupedItems = itemsToProcess.reduce((acc, { name, uuid }) => {
      if (!acc[name]) acc[name] = { count: 0, uuid };
      acc[name].count++;
      return acc;
    }, {});

    for (const [name, { count, uuid }] of Object.entries(groupedItems)) {
      const originalItem = await fromUuid(uuid);
      if (!originalItem) continue;

      const itemData = originalItem.toObject();
      itemData.system.quantity = count;

      // Add the "Infused" trait to the item
      if (!itemData.system.traits) {
        itemData.system.traits = { value: [] };
      }
      if (!itemData.system.traits.value.includes("infused")) {
        itemData.system.traits.value.push("infused");
      }

      // Add a flag to identify the creator
      itemData.flags = {
        ...itemData.flags,
        alembic: {
          creator: game.user.character.id
        }
      };

      // Check if an infused version of the item already exists in the inventory
      const existingInfusedItem = actor.items.find(i =>
        i.name === itemData.name &&
        i.type === itemData.type &&
        i.system.traits?.value.includes("infused")
      );

      if (existingInfusedItem) {
        // Update existing infused item quantity
        itemsToUpdate.push({
          _id: existingInfusedItem.id,
          "system.quantity": existingInfusedItem.system.quantity + count
        });
      } else {
        // Add new infused item
        itemsToAdd.push(itemData);
      }
    }

    // Perform updates and additions
    try {
      if (itemsToUpdate.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemsToUpdate);
      }
      if (itemsToAdd.length > 0) {
        await actor.createEmbeddedDocuments("Item", itemsToAdd);
      }
      const totalItemsAdded = itemsToProcess.length;
      ui.notifications.info(`Added ${totalItemsAdded} infused items to inventory.`);
      this.spawnedItems = this.spawnedItems.concat(itemsToProcess);
      this.items = this.items.slice(totalItemsAdded);
      this.render();
      this.updateDailyPreparationsCount();
      this.sendChatMessage(`Created ${totalItemsAdded} infused alchemical items: ${itemsToProcess.map(item => item.name).join(', ')}`);
    } catch (error) {
      // console.error("Error adding items to inventory:", error);
      ui.notifications.error("Failed to add items to inventory.");
    }
  }

  // Update the actor's inventory with current vial count
  async updateVersatileVials(quantityToAdd) {
    const actor = this.getActiveCharacter();
    if (!actor) return;

    let versatileVial = this.findVersatileVial(actor);

    if (versatileVial) {
      const newQuantity = versatileVial.system.quantity + quantityToAdd;
      if (newQuantity > 0) {
        // Update existing Versatile Vial quantity
        await actor.updateEmbeddedDocuments("Item", [{
          _id: versatileVial.id,
          "system.quantity": newQuantity
        }]);
      } else {
        // Remove the item if quantity reaches 0
        await actor.deleteEmbeddedDocuments("Item", [versatileVial.id]);
      }
    } else if (quantityToAdd > 0) {
      // Create the item if it doesn't exist and we are adding vials
      const compendium = game.packs.get("pf2e.equipment-srd");
      const vialEntryId = "ljT5pe8D7rudJqus";
      const vialEntry = await compendium.getDocument(vialEntryId);
      if (vialEntry) {
        const vialData = vialEntry.toObject();
        vialData.system.quantity = quantityToAdd;
        await actor.createEmbeddedDocuments("Item", [vialData]);
      } else {
        // console.error("Failed to find Versatile Vial in compendium");
        ui.notifications.error("Failed to find Versatile Vial in compendium.");
      }
    }
    this.render();
  }

  // Reset daily preparations (clear spawned items and items list)
  resetDailyPreparations() {
    this.spawnedItems = [];
    this.items = [];
    this.render(true);
    this.updateDailyPreparationsCount();
    ui.notifications.info("Daily preparations have been reset.");
  }

  // Set up a time check to prompt for adding vials every ten minutes
  setupTimeCheck() {
    Hooks.on('updateWorldTime', (worldTime, delta) => {
      const tenMinutesInSeconds = 600;
      if (worldTime - this.lastCheckedTime >= tenMinutesInSeconds) {
        this.onTenMinutesPassed();
        this.lastCheckedTime = worldTime;
      }
    });
  }

  // Handle actions when ten minutes have passed in-game
  onTenMinutesPassed() {
    if (!game.combat) {
      const { maxVials } = this.getData();
      if (this.currentVials < maxVials) {
        this.createAddVialsCard();
      }
    }
  }

  // Create a chat message prompting to add vials
  createAddVialsCard() {
    const content = `
      <p>${game.i18n.localize("myModule.alembic.chat.tenMinutesPassed")}</p>
      <button id="alembicAddVialsBtn">${game.i18n.localize("myModule.alembic.chat.addTwoVials")}</button>
    `;

    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
      content: content,
      flags: { alembic: { action: 'addVials' } }
    });
  }

  // Add Versatile Vials to the actor's inventory
  async addVersatileVials(quantity) {
    const actor = this.getActiveCharacter();
    if (!actor) return;

    const { maxVials } = this.getData();
    const availableSpace = maxVials - this.currentVials;
    const quantityToAdd = Math.min(quantity, availableSpace);

    if (quantityToAdd <= 0) {
      ui.notifications.warn(`Maximum number of vials (${maxVials}) reached!`);
      return;
    }

    await this.updateVersatileVials(quantityToAdd);
    this.currentVials = Math.min(this.currentVials + quantityToAdd, maxVials);
    this.render();
    this.updateVialCount();

    this.sendChatMessage(`Added ${quantityToAdd} Versatile Vial(s).`);
  }

  // Send a chat message as the actor
  sendChatMessage(message) {
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
      content: message
    });
  }

  // Refill vials and reset preparations on rest
  async refillVialsOnRest() {
    const actor = this.getActiveCharacter();
    if (!actor) return;

    const { maxVials } = this.getData();
    const vialsToAdd = maxVials - this.currentVials;

    if (vialsToAdd > 0) {
      await this.updateVersatileVials(vialsToAdd);
      this.currentVials = maxVials;
      this.render();
      this.sendChatMessage(`Refilled Versatile Vials to maximum capacity (${maxVials}).`);
    }

    // Add this line to expire infused items
    await this.expireInfusedItems();
  }

  // Add this new method
  async expireInfusedItems() {
    const actors = game.actors.contents;
    let expiredCount = 0;

    for (const actor of actors) {
      const infusedItems = actor.items.filter(item => 
        item.system.traits?.value.includes("infused") &&
        item.flags.alembic?.creator === game.user.character.id
      );

      if (infusedItems.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", infusedItems.map(item => item.id));
        expiredCount += infusedItems.length;

        // Notify the player whose items were expired
        if (actor.hasPlayerOwner) {
          ChatMessage.create({
            user: game.user.id,
            whisper: [actor.ownership.default],
            content: `${infusedItems.length} infused items created by ${game.user.character.name} have expired from your inventory.`
          });
        }
      }
    }

    if (expiredCount > 0) {
      this.sendChatMessage(`${expiredCount} infused items you created for other characters have expired.`);
    }
  }

  // Define header buttons, including the toggle content button
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    // Add the gear (settings) button
    buttons.unshift({
      label: "Settings",
      class: "configure-settings",
      icon: "fas fa-cog",
      onclick: () => AlembicSettings.openSettings()
    });

    // Add the toggle button (as before)
    buttons.unshift({
      label: "Toggle",
      class: "toggle-content",
      icon: "fas fa-chevron-down",
      onclick: () => this.toggleContent()
    });

    return buttons;
  }

  // Toggle between minimized and maximized views
  toggleContent() {
    const content = this.element.find('.window-content');
    const toggleButton = this.element.find('.toggle-content i');

    if (!this.isMinimized) {
      // Minimize the window
      this.maximizedSize = {
        width: this.position.width,
        height: this.position.height
      };
      content.hide();
      toggleButton.removeClass('fa-chevron-down').addClass('fa-chevron-up');

      // Create minimized view
      const minimizedContent = $(`
        <div class="minimized-content">
          <span class="vial-count"></span>
          <button class="use-vial">Use Vial</button>
          <button class="add-vial">Add Vial</button>
        </div>
      `);

      minimizedContent.find('.use-vial').click(this._onUseVial.bind(this));
      minimizedContent.find('.add-vial').click(this._onAddVial.bind(this));

      content.after(minimizedContent);

      // Update the vial count
      this.updateVialCount();

      // Set window size to accommodate the minimized view
      this.setPosition({ width: 300, height: 75 });
      this.isMinimized = true;
    } else {
      // Maximize the window
      this.maximizeWindow();
    }
  }

  // Add this new method
  maximizeWindow() {
    const content = this.element.find('.window-content');
    const toggleButton = this.element.find('.toggle-content i');

    content.show();
    toggleButton.removeClass('fa-chevron-up').addClass('fa-chevron-down');
    this.element.find('.minimized-content').remove();

    // Restore the maximized size
    if (this.maximizedSize) {
      this.setPosition(this.maximizedSize);
    } else {
      // Fallback to original size if maximizedSize is not set
      this.setPosition(this.originalSize);
    }
    this.isMinimized = false;
  }

  // Modify the close method to reset the window state
  close(options={}) {
    if (this.isMinimized) {
      this.maximizeWindow();
    }
    return super.close(options);
  }

  // Update the vial count displayed in the UI
  updateVialCount() {
    const { maxVials } = this.getData();
    this.currentVials = Math.min(this.currentVials, maxVials);

    const vialCountText = game.i18n.format("myModule.alembic.ui.vialCount", {
      current: this.currentVials,
      max: maxVials
    });

    const vialCountElement = this.element.find('.vial-count');
    if (vialCountElement.length) {
      vialCountElement.text(vialCountText);
    }
  }

  // Update the daily preparations count displayed in the UI
  updateDailyPreparationsCount() {
    const { maxItems } = this.getData();
    const currentPreparations = this.items.length + this.spawnedItems.length;

    const preparationsCountText = game.i18n.format("myModule.alembic.ui.preparationsCount", {
      current: currentPreparations,
      max: maxItems
    });

    const preparationsCountElement = this.element.find('.preparations-count');
    if (preparationsCountElement.length) {
      preparationsCountElement.text(preparationsCountText);
    }
  }

  async _onOpenFormulaBook(event) {
    event.preventDefault();
    const formulasApp = Formulas.getInstance();
    const button = event.currentTarget;
    
    if (formulasApp.rendered) {
      formulasApp.close();
      button.textContent = game.i18n.localize("myModule.alembic.ui.openFormulaBook");
    } else {
      formulasApp.render(true);
      button.textContent = game.i18n.localize("myModule.alembic.ui.closeFormulaBook");
    }
  }

  _onFormulasClosed() {
    const button = this.element.find('#openFormulaBook');
    button.text(game.i18n.localize("myModule.alembic.ui.openFormulaBook"));
  }

  //  method to remove an item from the list
  _removeItem(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.render();
    this.updateDailyPreparationsCount();
  }

  updateMaxVials(value) {
    this.render(true);
  }

  updateDailyPreparations(value) {
    // Reset the current items and spawned items
    this.items = [];
    this.spawnedItems = [];
    this.render(true);
    this.updateDailyPreparationsCount();
  }

  getDefaultMaxVials() {
    const actor = this.getActiveCharacter();
    if (!actor) return 2; // Default to 2 if no actor is found
    const intMod = actor.system.abilities?.int?.mod ?? 0;
    return intMod + 2;
  }

  getDefaultDailyPreparations() {
    const actor = this.getActiveCharacter();
    if (!actor) return 4; // Default to 4 if no actor is found
    const intMod = actor.system.abilities?.int?.mod ?? 0;
    return intMod + 4;
  }
}

// Register keybinding to open Alchemy Tracker
Hooks.on('init', () => {
  game.keybindings.register('pf2e-alembic', 'openalembic', {
    name: 'Open Alembic',
    hint: 'Opens the Alembic window',
    editable: [
      {
        key: 'KeyQ',
        modifiers: [
          KeyboardManager.MODIFIER_KEYS.CONTROL,
          KeyboardManager.MODIFIER_KEYS.SHIFT
        ]
      }
    ],
    onDown: () => {
      Alembic.getInstance().render(true);
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  AlembicSettings.registerSettings();
});

// Update tracker when actor is updated
Hooks.on('updateActor', (actor, changes) => {
  if (actor.id === game.user.character?.id) {
    const tracker = Alembic.getInstance();
    tracker.updateCurrentVials(actor);
    tracker.render();
  }
});

// Update tracker when Versatile Vial item is updated
Hooks.on('updateItem', (item, changes, options, userId) => {
  const actor = item.parent;
  if (actor && actor.id === game.user.character?.id &&
    (item.name === "Versatile Vial" ||
      item.flags.core?.sourceId === "Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus")) {
    const tracker = Alembic.getInstance();
    tracker.updateCurrentVials(actor);
    tracker.render();
  }
});

// Render custom item list and update UI elements
Hooks.on('renderAlembic', async (app, html, data) => {
  // Render the list of items
  const itemList = html.find('#itemList');
  itemList.empty();

  // Add a header row
  const headerRow = $(`
    <tr>
      <th style="text-align: left; width: 100%;">Item</th>
      <th style="text-align: center;"></th>
    </tr>
  `);
  itemList.append(headerRow);

  for (const item of data.items) {
    const originalItem = await fromUuid(item.uuid);
    if (!originalItem) continue;

    const tr = $('<tr class="item"></tr>');
    
    // First cell: Item details
    const itemCell = $('<td style="width: 100%;"></td>');
    const itemElement = $(`
      <div class="item-name flexrow" draggable="true">
        <img src="${originalItem.img}" alt="${originalItem.name}" width="24" height="24" style="margin-right: 8px;">
        <h4 style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${originalItem.name}</h4>
        ${item.isAlchemical ? '' : '<i class="fas fa-info-circle non-alchemical-icon" title="Non-Alchemical"></i>'}
      </div>
    `).attr('data-item-id', item.id);

    itemElement.on('dragstart', (event) => {
      event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'Item',
        uuid: item.uuid
      }));
    });

    itemCell.append(itemElement);
    tr.append(itemCell);

    // Second cell: Delete icon
    const deleteCell = $('<td style="width: 40px; text-align: center;"></td>');
    const deleteIcon = $(`<i class="fas fa-trash delete-item" title="Remove item" style="cursor: pointer;"></i>`);
    deleteIcon.on('click', (event) => {
      event.preventDefault();
      app._removeItem(item.id);
    });

    deleteCell.append(deleteIcon);
    tr.append(deleteCell);

    itemList.append(tr);
  }

  // Update UI elements with localization and counts
  html.find('.preparations-count').text(game.i18n.format("myModule.alembic.ui.itemCount", {
    current: data.items.length + data.spawnedItems.length,
    max: data.maxItems
  }));

  html.find('#addItem').text(game.i18n.localize("myModule.alembic.ui.addItem"));
  html.find('#reset').text(game.i18n.localize("myModule.alembic.ui.reset"));

  // Set up reset button click handler
  html.find('#reset').click(() => {
    app.resetDailyPreparations();
  });
});

// Handle chat messages for adding vials
Hooks.on('renderChatMessage', (message, html) => {
  if (message.flags.alembic?.action === 'addVials') {
    const button = html.find('#alembicAddVialsBtn');
    button.on('click', async (event) => {
      event.preventDefault();
      const tracker = Alembic.getInstance();
      await tracker.addVersatileVials(2);
    });
  }
});

// Refill vials and reset preparations after resting for the night
Hooks.on('pf2e.restForTheNight', async (actor, result) => {
  if (actor.id === game.user.character?.id) {
    const tracker = Alembic.getInstance();
    await tracker.refillVialsOnRest();
    tracker.resetDailyPreparations();
    tracker.sendChatMessage(game.i18n.localize("myModule.alembic.chat.resetPreparations"));
  }
});

export { Alembic };