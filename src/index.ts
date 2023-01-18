import { ITopBar } from 'jupyterlab-topbar';

import { INotification } from 'jupyterlab_toastify';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { OSInfo, StashInfo, WebDSService } from '@webds/service';

import { requestAPI } from './handler';

namespace CommandIDs {
  export const systemInfoDialog = 'webds_status_system_info:dialog';
}

const pinormosInfoTextWidgetClass = 'jp-webdsStatus-PinormosInfoTextWidget';

const androidConnectionTextWidgetClass =
  'jp-webdsStatus-AndroidConnectionTextWidget';

type TopBarItem = {
  name: string;
  widget: Widget;
};

const topBarItems: TopBarItem[] = [];

const addTopBarItem = (topBar: ITopBar, item: TopBarItem) => {
  topBarItems.forEach(({ widget }) => {
    widget.parent = null;
  });
  topBarItems.push(item);
  for (let index = topBarItems.length - 1; index >= 0; index--) {
    topBar.addItem(topBarItems[index].name, topBarItems[index].widget);
  }
};

const removeTopBarItem = (name: string) => {
  const index = topBarItems.findIndex(item => {
    return item.name === name;
  });
  if (index > -1) {
    topBarItems[index].widget.parent = null;
    topBarItems.splice(index, 1);
  }
};

/**
 * Initialization data for the @webds/status extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@webds/status:plugin',
  autoStart: true,
  requires: [ITopBar, WebDSService],
  activate: async (
    app: JupyterFrontEnd,
    topBar: ITopBar,
    service: WebDSService
  ) => {
    console.log('JupyterLab extension @webds/status is activated!');

    // PinormOS System Information

    let osInfo: OSInfo;

    const osInfoTextNode = document.createElement('div');
    osInfoTextNode.textContent = '';

    const osInfoTextWidget = new Widget({ node: osInfoTextNode });
    osInfoTextWidget.addClass(pinormosInfoTextWidgetClass);
    addTopBarItem(topBar, {
      name: 'pinormos-info-text',
      widget: osInfoTextWidget
    });

    let dialogBodyNode: HTMLDivElement;

    class DialogHandler extends Widget {
      constructor() {
        super({ node: dialogBodyNode });
      }
    }

    const showSystemInfoDialog = () => {
      showDialog({
        body: new DialogHandler(),
        buttons: [Dialog.okButton()]
      });
    };

    app.commands.addCommand(CommandIDs.systemInfoDialog, {
      label: 'System Information',
      execute: (args: any) => {
        showSystemInfoDialog();
      },
      isEnabled: () => true
    });

    app.contextMenu.addItem({
      command: CommandIDs.systemInfoDialog,
      selector: `.${pinormosInfoTextWidgetClass}`,
      rank: 0
    });

    const getSystemInfo = async () => {
      try {
        const newDialogBodyNode = document.createElement('div');
        const data = await requestAPI<any>('about?query=system-info');
        for (const module in data) {
          const text = `${module}: ${data[module]}`;
          const entry = document.createElement('span');
          entry.textContent = text;
          newDialogBodyNode.appendChild(entry);
        }
        dialogBodyNode = newDialogBodyNode;
      } catch (error) {
        console.error(`Error - GET /webds/about?query=system-info\n${error}`);
      }
    };

    const getOSInfo = async () => {
      osInfo = service.pinormos.getOSInfo();
      osInfoTextNode.textContent = 'PinormOS ' + osInfo.current.version;

      if (
        osInfo.repo.version > osInfo.current.version &&
        osInfo.repo.downloaded
      ) {
        const toastMessage = `PinormOS version ${osInfo.repo.version} available`;
        const id = await INotification.info(toastMessage);
        INotification.update({
          toastId: id,
          type: 'info',
          message: toastMessage,
          autoClose: 5 * 1000
        });
        return;
      }

      setTimeout(getOSInfo, 2000);
    };

    getOSInfo();
    getSystemInfo();

    const checkDataCollectionStash = async () => {
      const stashInfo: StashInfo = service.pinormos.getStashInfo();
      if (stashInfo.dataAvailable) {
        const toastMessage = 'Stashed data available to upload to TestRail';
        const id = await INotification.info(toastMessage);
        INotification.update({
          toastId: id,
          type: 'info',
          message: toastMessage,
          autoClose: 5 * 1000
        });
        return;
      }

      setTimeout(checkDataCollectionStash, 2000);
    };

    if (service.pinormos.isTestRailOnline()) {
      checkDataCollectionStash();
    }

    // Android Phone Connection Information

    let prev: boolean | undefined = undefined;
    let connection: boolean | undefined = undefined;

    const connectedText = 'Android phone connected';
    const androidConnectionTextNode = document.createElement('div');
    androidConnectionTextNode.textContent = connectedText;

    const androidConnectionTextWidget = new Widget({
      node: androidConnectionTextNode
    });
    androidConnectionTextWidget.addClass(androidConnectionTextWidgetClass);

    const checkAndroidConnection = async () => {
      try {
        const data = await requestAPI<any>('about?query=android-connection');
        if (connection !== data.connection) {
          connection = data.connection;
          console.log(`Android phone connection: ${connection}`);
        }
      } catch (error) {
        console.error(
          `Error - GET /webds/about?query=android-connection\n${error}`
        );
      }
      if (connection != prev) {
        if (connection) {
          const id = await INotification.info(connectedText);
          INotification.update({
            toastId: id,
            type: 'info',
            message: connectedText,
            autoClose: 5 * 1000
          });
          addTopBarItem(topBar, {
            name: 'android-connection-text',
            widget: androidConnectionTextWidget
          });
        } else {
          removeTopBarItem('android-connection-text');
        }
      }
      prev = connection;
    };

    setInterval(checkAndroidConnection, 500);
  }
};

export default plugin;
