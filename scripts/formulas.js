class Formulas extends Application {
    static instance = null;

    static getInstance() {
        if (!this.instance) {
            this.instance = new this();
        }
        return this.instance;
    }

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        template: "modules/pf2e-alembic/templates/formulas.html",
        width: 400,
        height: 500,
        resizable: true,
        title: "Formula Book"
      });
    }
  
    async getData(options = {}) {
      try {
        const data = await super.getData(options);
        const actor = game.user.character;

        if (actor) {
          data.formulas = await this.getKnownFormulas(actor);
          
          data.formulasByLevel = this.groupFormulasByLevel(data.formulas);

          const intMod = actor.system.abilities?.int?.mod ?? 0;
          data.maxItems = intMod + 4;
        } else {
          data.formulas = [];
          data.formulasByLevel = {};
          data.maxItems = 0;
        }

        data.droppedItems = this.droppedItems || [];

        return data;
      } catch (error) {
        console.error("Error in Formulas getData:", error);
        return { formulas: [], formulasByLevel: {}, maxItems: 0, droppedItems: [] };
      }
    }

    groupFormulasByLevel(formulas) {
      const formulasByLevel = {};
      formulas.forEach(formula => {
        if (!formulasByLevel[formula.level]) {
          formulasByLevel[formula.level] = [];
        }
        formulasByLevel[formula.level].push(formula);
      });
      return formulasByLevel;
    }
  
    async getKnownFormulas(actor) {
      const formulas = [];
      
      const craftingFormulas = actor.system.crafting.formulas || [];

      for (const formula of craftingFormulas) {
        if (formula.uuid) {
          try {
            const item = await fromUuid(formula.uuid);
            if (item) {
              const dcMatch = item.system.description.value.match(/@Check\[.*?\|dc:(\d+)\]/);
              const dc = dcMatch ? parseInt(dcMatch[1]) : "";
              
              formulas.push({
                name: item.name,
                uuid: formula.uuid,
                dc: dc,
                level: item.level ?? 0,
                type: item.type,
                img: item.img,
                isAlchemical: item.isAlchemical ?? false
              });
            }
          } catch (error) {
            console.error("Error retrieving item from UUID:", error);
          }
        }
      }

      return formulas.sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      });
    }
  
    activateListeners(html) {
      super.activateListeners(html);

      const dropZone = html.find('#formulaDropZone')[0];
      dropZone.addEventListener('dragover', this._onDragOver.bind(this));
      dropZone.addEventListener('dragleave', this._onDragLeave.bind(this));
      dropZone.addEventListener('drop', this._onDrop.bind(this));

      html.find('.formula-item .item-name').each((i, el) => {
        el.addEventListener('dragstart', this._onDragStart.bind(this));
      });

      html.find('.formula-item .item-name').on('click', this._onFormulaClick.bind(this));

      html.find('.formula-item .item-image').on('click', this._onFormulaIconClick.bind(this));

      html.find('.delete-formula').on('click', this._onDeleteFormula.bind(this));

      this._actorUpdateHook = Hooks.on("updateActor", (actor, changes) => {
        if (actor.id === game.user.character?.id && changes.system?.crafting?.formulas) {
          this.render(false);
        }
      });
    }

    _onDragStart(event) {
      const formulaElement = event.currentTarget.closest('.formula-item');
      const formulaData = {
        type: 'Item',
        uuid: formulaElement.dataset.uuid,
        isFormula: true
      };
      event.dataTransfer.setData('text/plain', JSON.stringify(formulaData));
    }

    _onDragOver(event) {
      event.preventDefault();
      event.target.classList.add('dragover');
    }

    _onDragLeave(event) {
      event.target.classList.remove('dragover');
    }

    async _onDrop(event) {
      event.preventDefault();
      event.target.classList.remove('dragover');

      try {
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));

        if (data.type === 'Item') {
          const item = await fromUuid(data.uuid);
          
          if (item && (item.type === 'formula' || this._canConvertToFormula(item))) {
            const actor = game.user.character;
            if (actor) {
              const craftingFormulas = actor.system.crafting.formulas || [];
              if (!craftingFormulas.some(f => f.uuid === data.uuid)) {
                const formulaData = this._convertToFormula(item);
                
                await actor.update({
                  'system.crafting.formulas': [...craftingFormulas, formulaData]
                });
                ui.notifications.info(`Added ${item.name} to known formulas.`);
                this.render(false);
              } else {
                ui.notifications.warn(`${item.name} is already in your known formulas.`);
              }
            } else {
              ui.notifications.warn("No active character found.");
            }
          } else {
            ui.notifications.warn(`${item.name} cannot be converted to a formula.`);
          }
        }
      } catch (error) {
        console.error("Error processing dropped formula:", error);
      }
    }

    _canConvertToFormula(item) {
      return item.type === 'consumable' || item.itemType === 'consumable';
    }

    _convertToFormula(item) {
      return {
        uuid: item.uuid,
        isFormula: true,
        name: item.name,
        level: item.level,
        type: item.type,
        img: item.img,
        dc: item.system.type === 'action' ? item.system.actions?.value?.dc?.value : item.system.crafting?.dc
      };
    }

    async _onFormulaClick(event) {
      event.preventDefault();
      const formulaElement = event.currentTarget.closest('.formula-item');
      const itemUuid = formulaElement.dataset.uuid;

      if (itemUuid) {
        const item = await fromUuid(itemUuid);
        if (item) {
          item.sheet.render(true);
        }
      }
    }

    async _onFormulaIconClick(event) {
      event.preventDefault();
      const formulaElement = event.currentTarget.closest('.formula-item');
      const itemUuid = formulaElement.dataset.uuid;

      if (itemUuid) {
        const item = await fromUuid(itemUuid);
        if (item) {
          this._sendItemInfoToChat(item);
        }
      }
    }

    _sendItemInfoToChat(item) {
      const chatData = {
        user: game.user.id,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        content: `
          <div class="formula-info-card">
            <h3>${item.name}</h3>
            <img src="${item.img}" alt="${item.name}" width="50" height="50">
            <p><strong>Level:</strong> ${item.level}</p>
            <p><strong>Type:</strong> ${item.type}</p>
            <p><strong>DC:</strong> ${item.system.type === 'action' ? item.system.actions?.value?.dc?.value ?? 'N/A' : item.system.crafting?.dc ?? 'N/A'}</p>
          </div>
        `,
        speaker: ChatMessage.getSpeaker({ actor: game.user.character })
      };

      ChatMessage.create(chatData);
    }

    async _addDroppedItem(name, uuid) {
      if (!name || !uuid) return;

      const actor = game.user.character;
      if (!actor) return;

      const intMod = actor.system.abilities?.int?.mod ?? 0;
      const maxItems = intMod + 4;

      if (!this.droppedItems) {
        this.droppedItems = [];
      }

      if (this.droppedItems.length < maxItems) {
        const item = await fromUuid(uuid);

        this.droppedItems.push({ name, uuid });
        this.render();
      } else {
        ui.notifications.warn(`Maximum number of items (${maxItems}) reached!`);
      }
    }

    close(options={}) {
        const result = super.close(options);
        Hooks.off("updateActor", this._actorUpdateHook);
        Hooks.call('formulasClosed', this);
        return result;
    }

    async render(force = false, options = {}) {
        if (this.instance && this._state > Application.RENDER_STATES.NONE) {
            return this.bringToTop();
        }
        const data = await this.getData(options);
        return super.render(force, mergeObject(options, { data }));
    }

    async _onDeleteFormula(event) {
      event.preventDefault();
      const formulaElement = event.currentTarget.closest('.formula-item');
      const itemUuid = formulaElement.dataset.uuid;

      if (itemUuid) {
        const actor = game.user.character;
        if (actor) {
          const craftingFormulas = actor.system.crafting.formulas || [];
          const updatedFormulas = craftingFormulas.filter(f => f.uuid !== itemUuid);

          await actor.update({
            'system.crafting.formulas': updatedFormulas
          });

          ui.notifications.info(`Formula removed from known formulas.`);
          this.render(false);
        } else {
          ui.notifications.warn("No active character found.");
        }
      }
    }
}

export { Formulas };
