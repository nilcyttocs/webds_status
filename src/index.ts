import { ITopBar } from 'jupyterlab-topbar';

import { INotification } from 'jupyterlab_toastify';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import {
  ConnectionInfo,
  OSInfo,
  StashInfo,
  WebDSService
} from '@webds/service';

import { requestAPI } from './handler';

namespace CommandIDs {
  export const systemInfoDialog = 'webds_status_system_info:dialog';
}

const pinormosInfoTextWidgetClass = 'jp-webdsStatus-PinormosInfoTextWidget';

const pinormosUpdateTextWidgetClass = 'jp-webdsStatus-PinormosUpdateTextWidget';

const connectionInfoTextWidgetClass = 'jp-webdsStatus-connectionInfoTextWidget';

const androidConnectionTextWidgetClass =
  'jp-webdsStatus-AndroidConnectionTextWidget';

type TopBarItem = {
  name: string;
  order: number;
  widget: Widget;
};

const topBarItems: TopBarItem[] = [];

const addTopBarItem = (topBar: ITopBar, item: TopBarItem) => {
  topBarItems.forEach(({ widget }) => {
    widget.parent = null;
  });
  topBarItems.push(item);
  topBarItems.sort((a, b) => b.order - a.order);
  topBarItems.forEach(item => topBar.addItem(item.name, item.widget));
  /*
  for (let index = topBarItems.length - 1; index >= 0; index--) {
    topBar.addItem(topBarItems[index].name, topBarItems[index].widget);
  }
  */
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
      order: 0,
      widget: osInfoTextWidget
    });

    const pinormosUpdateTextNode = document.createElement('div');
    pinormosUpdateTextNode.textContent = '';
    const pinormosUpdateTextWidget = new Widget({
      node: pinormosUpdateTextNode
    });
    pinormosUpdateTextWidget.addClass(pinormosUpdateTextWidgetClass);

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

      if (osInfo.repo.versionNum > osInfo.current.versionNum) {
        const toastMessage = `PinormOS ${osInfo.repo.version} update available`;
        const id = await INotification.info(toastMessage);
        INotification.update({
          toastId: id,
          type: 'info',
          message: toastMessage,
          autoClose: 5 * 1000
        });

        pinormosUpdateTextNode.textContent = toastMessage;
        addTopBarItem(topBar, {
          name: 'pinormos-update-text',
          order: 1,
          widget: pinormosUpdateTextWidget
        });

        return;
      }

      setTimeout(getOSInfo, 2000);
    };

    getOSInfo();
    getSystemInfo();

    // Data Collection Stash Information

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

    // Connection Information

    const connectionInfoNode = document.createElement('div');
    connectionInfoNode.style.display = 'flex';
    connectionInfoNode.style.flexDirection = 'row';
    connectionInfoNode.style.alignItems = 'center';
    connectionInfoNode.title = 'Refresh Device Connection';

    const connectionInfoTextNode = document.createElement('div');
    connectionInfoTextNode.style.marginRight = '8px';
    connectionInfoTextNode.textContent = '';

    const connectionInfoRefreshIconNode = document.createElement('div');
    connectionInfoRefreshIconNode.style.cursor = 'pointer';
    connectionInfoRefreshIconNode.style.width = '16px';
    connectionInfoRefreshIconNode.style.height = '16px';
    connectionInfoRefreshIconNode.style.borderRadius = '8px';
    connectionInfoRefreshIconNode.style.display = 'flex';
    const svgElement = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    svgElement.setAttribute('viewBox', '0 0 16 16');
    svgElement.style.width = '100%';
    svgElement.style.height = '100%';
    const pathElement = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );
    pathElement.setAttribute(
      'd',
      'M 13.550781 7.15625 L 13.550781 2.699219 L 12.078125 4.171875 C 10.914062 3.007812 9.5625 2.417969 8.023438 2.417969 C 4.949219 2.417969 2.449219 4.921875 2.449219 8 C 2.449219 11.074219 4.949219 13.578125 8.023438 13.578125 C 10.164062 13.578125 12.710938 12.464844 13.441406 9.339844 L 13.457031 9.28125 L 11.839844 9.28125 L 11.832031 9.3125 C 11.292969 10.933594 9.761719 12.023438 8.023438 12.023438 C 6.957031 12.027344 5.929688 11.601562 5.179688 10.84375 C 4.421875 10.09375 3.996094 9.066406 4 8 C 4 5.78125 5.804688 3.976562 8.023438 3.976562 C 9.058594 3.976562 9.84375 4.265625 10.988281 5.261719 L 9.089844 7.15625 Z M 13.550781 7.15625 '
    );
    pathElement.style.fill = '#007dc3';
    svgElement.appendChild(pathElement);
    connectionInfoRefreshIconNode.appendChild(svgElement);
    connectionInfoRefreshIconNode.addEventListener('click', () => {
      service.pinormos.checkConnection();
    });
    connectionInfoRefreshIconNode.addEventListener('mouseover', function () {
      const mode = service.ui.getJupyterThemeMode();
      connectionInfoRefreshIconNode.style.backgroundColor =
        mode === 'light' ? '#e0e0e0' : '#616161';
    });
    connectionInfoRefreshIconNode.addEventListener('mouseout', function () {
      connectionInfoRefreshIconNode.style.backgroundColor = 'transparent';
    });

    connectionInfoNode.appendChild(connectionInfoTextNode);
    connectionInfoNode.appendChild(connectionInfoRefreshIconNode);

    const connectionInfoTextWidget = new Widget({
      node: connectionInfoNode
    });
    connectionInfoTextWidget.addClass(connectionInfoTextWidgetClass);

    let prevConnectionInfo: ConnectionInfo | undefined = undefined;
    const getConnectionInfo = () => {
      const connectionInfo: ConnectionInfo = service.pinormos.getConnectionInfo();
      if (
        prevConnectionInfo === undefined ||
        JSON.stringify(prevConnectionInfo) !== JSON.stringify(connectionInfo)
      ) {
        prevConnectionInfo = { ...connectionInfo };
        let textContent = 'Connection: ';
        if (connectionInfo.interface === undefined) {
          textContent += 'invalid';
        } else {
          textContent += `${connectionInfo.partNumber} `;
          switch (connectionInfo.interface) {
            case 'i2c':
              textContent += `I2C addr=${connectionInfo.i2cAddr}`;
              break;
            case 'spi':
              textContent += `SPI mode=${connectionInfo.spiMode}`;
              break;
            case 'phone':
              textContent += 'Android phone';
              break;
            default:
              break;
          }
        }
        connectionInfoTextNode.textContent = textContent;
      }

      setTimeout(getConnectionInfo, 1000);
    };

    getConnectionInfo();

    // Android Device Connection Information

    let prev: boolean | undefined = undefined;
    let connection: boolean | undefined = undefined;

    const connectedText = 'Connection: Android device';
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
          console.log(`Android device connection: ${connection}`);
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
          removeTopBarItem('connection-info-text');
          addTopBarItem(topBar, {
            name: 'android-connection-text',
            order: 3,
            widget: androidConnectionTextWidget
          });
          const external = service.pinormos.isExternal();
          try {
            if (external) {
              await service.packrat.cache.addPublicConfig();
            } else {
              await service.packrat.cache.addPrivateConfig();
            }
          } catch (error) {
            console.error(error);
          }
        } else {
          removeTopBarItem('android-connection-text');
          addTopBarItem(topBar, {
            name: 'connection-info-text',
            order: 2,
            widget: connectionInfoTextWidget
          });
        }
      }
      prev = connection;
    };

    setInterval(checkAndroidConnection, 500);
  }
};

export default plugin;
