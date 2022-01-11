import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Dialog, showDialog } from '@jupyterlab/apputils';

import { Widget } from '@lumino/widgets';

import { ITopBar } from 'jupyterlab-topbar';

import { INotification } from 'jupyterlab_toastify';

import { requestAPI } from './handler';

const pinormosInfoTextWidgetClass = 'jp-webdsPinormosInfoWidget';
const androidConnectionTextWidgetClass = 'jp-webdsAndroidConnectionWidget';

namespace CommandIDs {
  export const systemInfoDialog = 'webds_status_system_info:dialog';
}

/**
 * Initialization data for the @webds/status extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@webds/status:plugin',
  autoStart: true,
  requires: [ITopBar],
  activate: async (app: JupyterFrontEnd, topBar: ITopBar) => {
    console.log('JupyterLab extension @webds/status is activated!');

    // PinormOS System Information

    let pinormosInfoText = '';

    const dialogBodyNode = document.createElement('div');

    function showSystemInfoDialog() {
      showDialog({
        body: new DialogHandler(),
        buttons: [Dialog.okButton()]
      });
    }

    await requestAPI<any>('about?query=os-info')
    .then(data => {
      let name = data['NAME'];
      let version = data['VERSION_ID'];
      if (name && name[0] === '"') {
        name = name.slice(1, name.length - 1);
      }
      if (version && version[0] === '"') {
        version = version.slice(1, version.length - 1);
      }
      pinormosInfoText = name + ' ' + version;
    })
    .catch(reason => {
      console.error(
        `Error on GET /webds/about?os-info\n${reason}`
      );
    });

    await requestAPI<any>('about?query=system-info')
    .then(data => {
      for (const module in data) {
        const text = `${module}: ${data[module]}`;
        const entry = document.createElement('span');
        entry.textContent = text;
        dialogBodyNode.appendChild(entry);
      }
    })
    .catch(reason => {
      console.error(
        `Error on GET /webds/about?system-info\n${reason}`
      );
    });

    const pinormosInfoTextNode = document.createElement('div');
    pinormosInfoTextNode.textContent = pinormosInfoText;

    const pinormosInfoTextWidget = new Widget({ node: pinormosInfoTextNode });
    pinormosInfoTextWidget.addClass(pinormosInfoTextWidgetClass);
    topBar.addItem('pinormos-info-text', pinormosInfoTextWidget);

    app.contextMenu.addItem({
      command: CommandIDs.systemInfoDialog,
      selector: `.${pinormosInfoTextWidgetClass}`,
      rank: 1
    });

    app.commands.addCommand(CommandIDs.systemInfoDialog, {
      label: 'System Information',
      execute: (args: any) => {
        showSystemInfoDialog();
      },
      isEnabled: () => true
    });

    class DialogHandler extends Widget {
      constructor() {
        super({ node: dialogBodyNode });
      }
    }

    // Android Phone Connection Information

    let prev: boolean|undefined = undefined;
    let connection: boolean|undefined = undefined;

    const connectedText: string = 'Android phone connected';
    const connectedColor: string = 'black';
    const notConnectedText: string|null = null;
    const notConnectedColor: string = 'grey';

    const androidConnectionTextNode = document.createElement('div');
    androidConnectionTextNode.textContent = notConnectedText;
    androidConnectionTextNode.style.color = notConnectedColor;

    const androidConnectionTextWidget = new Widget({ node: androidConnectionTextNode });
    androidConnectionTextWidget.addClass(androidConnectionTextWidgetClass);
    topBar.addItem('android-connection-text', androidConnectionTextWidget);

    const checkAndroidConnection = async () => {
      requestAPI<any>('about?query=android-connection')
      .then(data=> {
        if (connection !== data.connection) {
          connection = data.connection;
          console.log(`Android phone connection: ${connection}`);
        }
      }).catch(reason => {
        console.error(
          `Error on GET /webds/about?android-connection\n${reason}`
        );
      });
      if (connection != prev) {
        if (connection) {
          const id = await INotification.info(connectedText);
          INotification.update({
            toastId: id,
            message: connectedText,
            autoClose: 3000
          });
          androidConnectionTextNode.textContent = connectedText;
          androidConnectionTextNode.style.color = connectedColor;
        } else {
          androidConnectionTextNode.textContent = notConnectedText;
          androidConnectionTextNode.style.color = notConnectedColor;
        }
      }
      prev = connection;
    };

    setInterval(checkAndroidConnection, 500);
  }
};

export default plugin;
