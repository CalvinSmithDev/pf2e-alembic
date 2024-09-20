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

  static updateSettings(formData) {
    const versatileVials = parseInt(formData['versatile-vials']);
    const dailyPreparations = parseInt(formData['daily-preparations']);

    let settingsChanged = false;

    if (!isNaN(versatileVials)) {
      game.settings.set('alembic', 'versatileVials', versatileVials);
      settingsChanged = true;
    }
    if (!isNaN(dailyPreparations)) {
      game.settings.set('alembic', 'dailyPreparations', dailyPreparations);
      settingsChanged = true;
    }

    if (settingsChanged) {
      ui.notifications.info("Alembic settings updated.");

      // Update the Alembic instance with new values
      const alembic = Alembic.getInstance();
      alembic.updateMaxVials(versatileVials);
      alembic.updateDailyPreparations(dailyPreparations);
      
      // Force a re-render of the Alembic instance
      alembic.render(true);
    }
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
        }
      });

      this.settingsWindow.render(true);
    } catch (error) {
      console.error("Error rendering Alembic settings:", error);
      ui.notifications.error("Failed to open Alembic settings.");
    }
  }
}
