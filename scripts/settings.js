import { Alembic } from './alembic.js';

export class AlembicSettings {
  static registerSettings() {
    game.settings.register('alembic', 'versatileVials', {
      name: 'Maximum Versatile Vials',
      hint: 'Set the maximum number of Versatile Vials',
      scope: 'client',
      config: false,
      type: Number,
      default: 0,
      onChange: value => {
        const alembic = Alembic.getInstance();
        alembic.updateMaxVials(value);
      }
    });

    game.settings.register('alembic', 'dailyPreparations', {
      name: 'Number of Daily Preparations',
      hint: 'Set the number of daily preparations',
      scope: 'client',
      config: false,
      type: Number,
      default: 0,
      onChange: value => {
        const alembic = Alembic.getInstance();
        alembic.updateDailyPreparations(value);
      }
    });
  }

  static async updateSettings(formData) {
    const versatileVials = parseInt(formData['versatile-vials']);
    const dailyPreparations = parseInt(formData['daily-preparations']);

    if (!isNaN(versatileVials)) {
      const alembic = Alembic.getInstance();
      const currentVials = alembic.currentVials;

      // Update the setting
      await game.settings.set('alembic', 'versatileVials', versatileVials);

      // If the new maxVials is less than the current vials, reduce the inventory
      if (versatileVials < currentVials) {
        const reduction = currentVials - versatileVials;
        await alembic.updateVersatileVials(-reduction);
        ui.notifications.info(`Reduced Versatile Vials in inventory by ${reduction} to match new maximum.`);
      }
    }

    if (!isNaN(dailyPreparations)) {
      await game.settings.set('alembic', 'dailyPreparations', dailyPreparations);
    }

    ui.notifications.info("Alembic settings updated.");

    // Render the Alembic instance to reflect the changes
    Alembic.getInstance().render(true);
  }

  static getSettings() {
    return {
      versatileVials: game.settings.get('alembic', 'versatileVials'),
      dailyPreparations: game.settings.get('alembic', 'dailyPreparations')
    };
  }

  static async openSettings() {
    if (this.settingsWindow && !this.settingsWindow.closed) {
      this.settingsWindow.focus();
      return;
    }

    try {
      const settings = this.getSettings();
      const content = await renderTemplate('modules/pf2e-alembic/templates/settings.html', settings);
      
      this.settingsWindow = new Dialog({
        title: "Alembic Settings",
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save Settings",
            callback: (html) => {
              const form = html.find('form')[0];
              if (form) {
                const formData = new FormData(form);
                this.updateSettings(Object.fromEntries(formData));
                
                // Call render() on the Alembic instance after saving
                const alembic = Alembic.getInstance();
                alembic.render(true);
              }
            }
          },
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Close"
          }
        },
        default: "save",
        close: () => {
          this.settingsWindow = null;
        },
        render: (html) => {
          // Set the current values in the input fields
          html.find('#versatile-vials').val(settings.versatileVials);
          html.find('#daily-preparations').val(settings.dailyPreparations);

          // Add event listeners for default buttons
          html.find('#default-vials').click(() => {
            const alembic = Alembic.getInstance();
            const defaultVials = alembic.getDefaultMaxVials();
            html.find('#versatile-vials').val(defaultVials);
          });

          html.find('#default-preparations').click(() => {
            const alembic = Alembic.getInstance();
            const defaultPreparations = alembic.getDefaultDailyPreparations();
            html.find('#daily-preparations').val(defaultPreparations);
          });
        }
      });

      this.settingsWindow.render(true);
    } catch (error) {
      console.error("Error rendering Alembic settings:", error);
      ui.notifications.error("Failed to open Alembic settings.");
    }
  }
}
