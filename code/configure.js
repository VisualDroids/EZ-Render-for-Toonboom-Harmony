/**
 * @file EZ Render for Toonboom Harmony
 * @copyright Visual Droids < www.visualdroids.com >
 * @author miwgel < github.com/miwgel >
 */

function fetchData(absFilePath) {
  var readFile = new QFile(absFilePath);
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

  // Keyboard Shortcuts
  ScriptManager.addShortcut({
    id: "com.visualdroids.ezbackup.keybind1",
    text: "EZ Render: Create a backup of the scene",
    action: "triggerBackupFromKeyboard in " + packageFolder + "/ezbackup.js",
    longDesc: "Triggers a backup right away",
    categoryId: "Visual Droids",
    categoryText: packageInfo.packageShortName,
  });

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
      action: "restartToolbar in " + packageFolder + "/configure.js",
    });
  }

  ScriptManager.addToolbar(toolbar);

  try {
    // Create an updater instance
    var Updater = require(packageFolder + "/lib/Updater/updater.js").Updater;
    new Updater(
      (parentContext = this),
      (packageInfo = packageInfo),
      (onCompleteCallback = null),
      (debug = packageInfo.debugMode)
    );
  } catch (error) {
    MessageLog.trace(error);
  }
  try {
    // Create an EZ Render instance
    var createEZRender = require(packageInfo.packageFolder +
      "/ezrender.js").createEZRender;
    createEZRender(packageInfo, packageInfo.debugMode);
  } catch (error) {
    MessageLog.trace(error);
  }
}

function restartToolbar() {
  var restartEZRender = require(packageInfo.packageFolder +
    "/ezrender.js").restartEZRender;
  restartEZRender.call(this, packageInfo, packageInfo.debugMode);
  // configure(packageFolder);
}

exports.packageInfo = packageInfo;
exports.configure = configure;
