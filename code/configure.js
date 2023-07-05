/**
 * @file EZ Render for Toonboom Harmony
 * @copyright Visual Droids < www.visualdroids.com >
 * @author miwgel < biste.cc >
 */

function fetchData(filePath) {
  var readFile = new QFile(filePath);
  try {
    if (!readFile.open(QIODevice.ReadOnly)) {
      throw new Error("Unable to open file.");
    }
    var data = readFile.readAll();
    return data;
  } catch (error) {
    MessageLog.trace(error);
  } finally {
    readFile.close();
  }
}

const packageFolder = __file__
  .split("\\")
  .join("/")
  .split("/")
  .slice(0, -1)
  .join("/");

var vdPackage = JSON.parse(fetchData(packageFolder + "/vdpackage.json"));

const packageInfo = {
  debugMode: vdPackage.debugMode,
  packagePublisher: vdPackage.packagePublisher,
  packageName: vdPackage.packageName,
  packageShortName: vdPackage.packageShortName,
  packageFullName: vdPackage.packageFullName,
  packageID: vdPackage.packageID,
  packageFolder: packageFolder,
  packageVersion: vdPackage.packageVersion,
  packageApiURL: vdPackage.packageApiURL,
};

function configure(packageFolder, packageName) {
  if (about.isPaintMode()) return;

  // init(); // Load EzRender to proto

  // Menu Items
  ScriptManager.addMenuItem({
    targetMenuId: "Windows",
    id: packageInfo.packageID,
    text: packageInfo.packageFullName,
    icon: "EZRender.png",
    action: "showEZRenderMainScreen in " + packageFolder + "/configure.js",
    shortcut: packageInfo.packageID + "keybind0",
  });

  // Keyboard Shortcuts
  ScriptManager.addShortcut({
    id: packageInfo.packageID + "keybind0",
    text: "EZ Render: Open Main Window",
    action: "showEZRenderMainScreen in " + packageFolder + "/configure.js",
    longDesc: "Opens EZ Render Main Window",
    categoryId: "Visual Droids",
    categoryText: packageInfo.packageShortName,
  });

  ScriptManager.addShortcut({
    id: packageInfo.packageID + "keybind1",
    text: "EZ Render: Set Current Frame as Start Frame for the Render",
    action: "setStartFrame in " + packageFolder + "/configure.js",
    longDesc: "Triggers a backup right away",
    categoryId: "Visual Droids",
    categoryText: packageInfo.packageShortName,
  });
  ScriptManager.addShortcut({
    id: packageInfo.packageID + "keybind2",
    text: "EZ Render: Set Current Frame as End Frame for the Render",
    action: "setEndFrame in " + packageFolder + "/configure.js",
    longDesc: "Triggers a backup right away",
    categoryId: "Visual Droids",
    categoryText: packageInfo.packageShortName,
  });

  // ScriptManager.addShortcut({
  //   id: packageInfo.packageID + "keybind3",
  //   text: "EZ Render: Render the scene",
  //   action: "triggerEzRender in " + packageFolder + "/configure.js",
  //   longDesc: "Renders the scene right away",
  //   categoryId: "Visual Droids",
  //   categoryText: packageInfo.packageShortName,
  // });

  var toolbar = new ScriptToolbarDef({
    id: packageInfo.packageID,
    text: packageInfo.packageFullName,
    customizable: false,
  });

  if (packageInfo.debugMode) {
    toolbar.addButton({
      text: "Fast Debugger",
      icon: "",
      checkable: false,
      action: "fastDebugger in " + packageFolder + "/configure.js",
    });
  }

  toolbar.addButton({
    text: "EZ Render",
    icon: "EZRender.png",
    checkable: false,
    action: "showEZRenderMainScreen in " + packageFolder + "/configure.js",
  });

  ScriptManager.addToolbar(toolbar);

  // try {
  //   // Create an updater instance
  //   var Updater = require(packageFolder + "/lib/Updater/updater.js").Updater;
  //   new Updater(
  //     (parentContext = this),
  //     (packageInfo = packageInfo),
  //     (onCompleteCallback = null),
  //     (debug = packageInfo.debugMode)
  //   );
  // } catch (error) {
  //   MessageLog.trace(error);
  // }
  // try {
  //   // Create an EZ Render instance
  //   var createEZRender = require(packageInfo.packageFolder +
  //     "/ezrender.js").createEZRender;
  //   createEZRender(packageInfo, packageInfo.debugMode);
  // } catch (error) {
  //   MessageLog.trace(error);
  // }

  // ScriptManager.addView({
  //   id: "EZ Render",
  //   text: "Visual Droids EZ Render",
  //   action: "initEzRender in ./configure.js",
  // });
}

// function restartToolbar() {
//   var restartEZRender = require(packageInfo.packageFolder +
//     "/ezrender.js").restartEZRender;
//   restartEZRender.call(this, packageInfo, packageInfo.debugMode);
//   // configure(packageFolder);
// }

// Load EZ Render into memory
// function init() {
//   // var packageInfo = require("./configure.js").packageInfo;
//   var EzRender = require("./ezrender.js").EzRender;
//   this.__proto__.ezrender = new EzRender(packageInfo);
// }

// Display EZ Render Main Window
function showEZRenderMainScreen() {
  // // Method 1 PROTO:
  // try {
  //   this.__proto__.ezrender.showAdvancedUI();
  // } catch (error) {
  //   MessageBox.information(
  //     "This tool didn't load properly\n\n" +
  //       "Please contact the developers though Gumroad or Discord\n\n" +
  //       error
  //   );
  // }
  // Method 2 Classic
  var EzRender = require("./ezrender.js").EzRender;
  var ezrenderInstance = new EzRender(packageInfo);
  ezrenderInstance.showAdvancedUI();
}

// function triggerEzRender() {
//   try {
//     this.__proto__.ezrender.ui.main.buttonRender.clicked();
//   } catch (error) {
//     MessageBox.information(
//       "This tool didn't load properly\n\n" +
//         "Please contact the developers though Gumroad or Discord\n\n" +
//         error
//     );
//   }
// }

function setStartFrame() {
  scene.setStartFrame(frame.current());
}

function setEndFrame() {
  scene.setStopFrame(frame.current());
}

function fastDebugger() {
  MessageLog.clearLog();
  var EzRender = require("./ezrender.js").EzRender;
  var isi = new EzRender(packageInfo);
  isi.showAdvancedUI();
}

exports.packageInfo = packageInfo;
exports.configure = configure;
