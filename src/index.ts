import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from "@jupyterlab/application";

import { Dialog, showDialog } from "@jupyterlab/apputils";

import { Widget } from "@lumino/widgets";

import { ITopBar } from "jupyterlab-topbar";

import { INotification } from "jupyterlab_toastify";

import { OSInfo, WebDSService } from "@webds/service";

import { requestAPI } from "./handler";

const pinormosInfoTextWidgetClass = "jp-webdsStatus-PinormosInfoTextWidget";
const androidConnectionTextWidgetClass =
  "jp-webdsStatus-AndroidConnectionTextWidget";

namespace CommandIDs {
  export const systemInfoDialog = "webds_status_system_info:dialog";
}

const redDot = document.createElement("div");
redDot.style.cssText =
  "width:10px;height:10px;background-color:red;border-radius:50%;position:absolute;top:5px;right:5px";

const addRedDot = (element: HTMLElement | null) => {
  if (element) {
    element.appendChild(redDot);
  }
};

const removeRedDot = (element: HTMLElement | null) => {
  redDot.remove();
  if (element) {
    element.remove();
  }
};

/**
 * Initialization data for the @webds/status extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: "@webds/status:plugin",
  autoStart: true,
  requires: [ITopBar, WebDSService],
  activate: async (
    app: JupyterFrontEnd,
    topBar: ITopBar,
    service: WebDSService
  ) => {
    console.log("JupyterLab extension @webds/status is activated!");

    // PinormOS System Information

    let osInfo: OSInfo;

    const osInfoTextNode = document.createElement("div");
    osInfoTextNode.textContent = "";

    const osInfoTextWidget = new Widget({ node: osInfoTextNode });
    osInfoTextWidget.addClass(pinormosInfoTextWidgetClass);
    topBar.addItem("pinormos-info-text", osInfoTextWidget);

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
      label: "System Information",
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

    let currentVersion = "";

    const getSystemInfo = async () => {
      try {
        const newDialogBodyNode = document.createElement("div");
        const data = await requestAPI<any>("about?query=system-info");
        for (const module in data) {
          const text = `${module}: ${data[module]}`;
          const entry = document.createElement("span");
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
      osInfoTextNode.textContent = "PinormOS " + osInfo.current.version;

      if (currentVersion !== osInfo.current.version) {
        currentVersion = osInfo.current.version;
        if (osInfo.repo.version > osInfo.current.version) {
          const toastMessage = `PinormOS version ${osInfo.repo.version} available`;
          const id = await INotification.info(toastMessage);
          INotification.update({
            toastId: id,
            type: "info",
            message: toastMessage,
            autoClose: 5 * 1000
          });
          const dsdkUpdate = document.getElementById(
            "webds-launcher-card-DSDK-Update"
          );
          addRedDot(dsdkUpdate);
        } else {
          const dsdkUpdateRedDot = document.getElementById(
            "webds-launcher-card-DSDK-Update-Red-Dot"
          );
          removeRedDot(dsdkUpdateRedDot);
          await getSystemInfo();
        }
      }

      setTimeout(getOSInfo, 2000);
    };

    await getOSInfo();
    await getSystemInfo();

    // Android Phone Connection Information

    let prev: boolean | undefined = undefined;
    let connection: boolean | undefined = undefined;

    const connectedText: string = "Android phone connected";
    const connectedColor: string = "black";
    const notConnectedText: string | null = null;
    const notConnectedColor: string = "grey";

    const androidConnectionTextNode = document.createElement("div");
    androidConnectionTextNode.textContent = notConnectedText;
    androidConnectionTextNode.style.color = notConnectedColor;

    const androidConnectionTextWidget = new Widget({
      node: androidConnectionTextNode
    });
    androidConnectionTextWidget.addClass(androidConnectionTextWidgetClass);
    topBar.addItem("android-connection-text", androidConnectionTextWidget);

    const checkAndroidConnection = async () => {
      try {
        const data = await requestAPI<any>("about?query=android-connection");
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
            type: "info",
            message: connectedText,
            autoClose: 5 * 1000
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
