/**
 * @file EZ Render for Toonboom Harmony
 * @version 23.6
 * @copyright Visual Droids < www.visualdroids.com >
 * @author miwgel < biste.cc >
 * @license
 * Copyright 2023 Visual Droids
 * The current script (the "Script") is the exclusive property of Visual Droids and is protected by copyright laws and international treaty provisions. The Script is licensed, not sold.
 * Subject to the terms and conditions of this license, Visual Droids grants to the purchaser of the Script (the "Licensee") a non-exclusive, non-transferable license to use the Script for the Licensee's own internal business or personal purposes. Any use of the Script beyond the scope of this license is strictly prohibited.
 * The Licensee is not allowed to copy, modify, distribute, sell, transfer, sublicense, or reverse engineer the Script without the prior written consent of Visual Droids.
 * The Script is provided "as is" without warranty of any kind, either expressed or implied, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose. In no event shall Visual Droids be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in connection with the use or inability to use the Script.
 * This license is effective until terminated. This license will terminate automatically without notice from Visual Droids if the Licensee fails to comply with any provision of this license. Upon termination, the Licensee must immediately cease all use of the Script.
 * This license shall be governed by and construed in accordance with the laws of Ecuador. Any disputes arising under or in connection with this license shall be resolved by the courts located in Ecuador.
 * By using the Script, the Licensee agrees to be bound by the terms and conditions of this license. If the Licensee does not agree to these terms, they must not use the Script.
 */

/*
TODO: #5 Catch errors when there are no display nodes in the scene (Solved, but not gracefully because it now checks everytime a node is changed. Could be better implemented if we check nodes changing only when the advanced ui is open) With last line fix: If a display node is first disconnected, and then deleted, the advanced ui doesnt notice the change
TODO: #6 Resize toolbar after presets are changed elsewhere
TODO: #7 Catch errors in toolbar's quick render & advanced ui's render buttons, when there are no presets.
TODO: #13 Render a single frame
*/

/**
 * @param { object } packageInfo Object with information about the current package
 */
function EzRender(packageInfo) {
  this.debug = packageInfo.debug;

  this.packageInfo = packageInfo;

  this.presets = new presetsObject(
    fileMapper.toNativePath(
      (about.isWindowsArch()
        ? System.getenv("USERPROFILE")
        : System.getenv("HOME")) + "/.ezrender.config"
    )
  );

  this.outputFolder = (scene.currentProjectPathRemapped() + "/renders")
    .split("\\")
    .join("/");
  this.createFolder(this.outputFolder);

  this.displayNodes = {};
  this.editMode = "";
  this.renderMode = "";

  this.beep = {
    win: new (require(this.packageInfo.packageFolder +
      "/lib/AudioPlayer/audioplayer.js").AudioPlayer)(
      this.packageInfo.packageFolder + "/sound/win.wav"
    ),
  };

  // Init sequence
  // this.setupToolbarUI(); // Setup Toolbar UI
  // this.hookToolbar(); // Hook Toolbar UI to the Toonboom Harmony toolbar
  this.setupAdvancedUI(); // Setup Advanced UI
  this.refreshPresetsAndDisplays(); // Update Presets at startup | Needs both the toolbar ui & the advanced ui loaded
}

// EzRender.prototype = new QObject();

// Presets object prototype and functions
function presetsObject(presetsFilePath) {
  this.presetsFile = new QFile(presetsFilePath);
}

Object.defineProperty(presetsObject.prototype, "data", {
  get: function () {
    try {
      if (!this.presetsFile.exists()) this.initPresetsFile(); // Initialize settings file if it doesn't exist
      if (!this.presetsFile.open(QIODevice.ReadOnly)) {
        throw new Error("Unable to open file.");
      }
      return JSON.parse(this.presetsFile.readAll());
    } catch (error) {
      MessageLog.trace(error);
    } finally {
      this.presetsFile.close();
    }
  },
  set: function (obj) {
    try {
      if (!this.presetsFile.exists()) this.initPresetsFile(); // Initialize settings file if it doesn't exist
      if (!this.presetsFile.open(QIODevice.WriteOnly)) {
        throw new Error("Unable to open file.");
      }
      this.presetsFile.write(
        new QByteArray().append(JSON.stringify(obj, null, 2))
      );
    } catch (error) {
      MessageLog.trace(error);
    } finally {
      this.presetsFile.close();
    }
  },
});

presetsObject.prototype.toString = function () {
  return JSON.stringify(this.data);
};

/**
 *
 * @param { string } presetName
 * @param { string } renderTag
 * @param { string } resX
 * @param { string } resY
 * @param { bool } mov
 * @param { bool } mp4
 * @param { bool } pngseq
 */
presetsObject.prototype.add = function (
  presetName,
  renderTag,
  resX,
  resY,
  mov,
  mp4,
  pngseq
) {
  var obj = this.data;
  obj[presetName] = {
    render_enabled: true,
    render_tag: renderTag,
    resolution_x: resX,
    resolution_y: resY,
    render_formats: {
      mov: mov,
      mp4: mp4,
      pngseq: pngseq,
    },
  };
  this.data = obj;
};

/**
 *
 * @param { string } presetName
 * @param { bool } renderEnabled
 * @param { string } renderTag
 * @param { string } resX
 * @param { string } resY
 * @param { bool } mov
 * @param { bool } mp4
 * @param { bool } pngseq
 */
presetsObject.prototype.edit = function (
  presetName,
  renderEnabled,
  renderTag,
  resX,
  resY,
  mov,
  mp4,
  pngseq
) {
  if (typeof presetName === "undefined") throw new Error("No preset selected");

  var obj = this.data;

  if (!obj.hasOwnProperty(presetName))
    throw new Error('Preset "' + presetName + '" not found');

  if (typeof renderEnabled === "undefined")
    var renderEnabled = obj[presetName].render_enabled;
  if (typeof renderTag === "undefined")
    var renderTag = obj[presetName].render_tag;
  if (typeof resX === "undefined") var resX = obj[presetName].resolution_x;
  if (typeof resY === "undefined") var resY = obj[presetName].resolution_y;
  if (typeof mov === "undefined") var mov = obj[presetName].render_formats.mov;
  if (typeof mp4 === "undefined") var mp4 = obj[presetName].render_formats.mp4;
  if (typeof pngseq === "undefined")
    var pngseq = obj[presetName].render_formats.pngseq;

  obj[presetName] = {
    render_enabled: renderEnabled,
    render_tag: renderTag,
    resolution_x: resX,
    resolution_y: resY,
    render_formats: {
      mov: mov,
      mp4: mp4,
      pngseq: pngseq,
    },
  };
  this.data = obj;
};

presetsObject.prototype.remove = function (presetName) {
  var obj = this.data;
  if (!obj.hasOwnProperty(presetName))
    throw new Error('Preset "' + presetName + '" not found');
  delete obj[presetName];
  this.data = obj;
};

presetsObject.prototype.initPresetsFile = function () {
  var examplePresets = {
    "Full HD PNG Sequence": {
      render_enabled: false,
      render_tag: "Test",
      resolution_x: "1920",
      resolution_y: "1080",
      render_formats: {
        mov: false,
        mp4: false,
        pngseq: true,
      },
    },
    "Full HD mov": {
      render_enabled: false,
      render_tag: "Test",
      resolution_x: "1920",
      resolution_y: "1080",
      render_formats: {
        mov: true,
        mp4: false,
        pngseq: false,
      },
    },
    "Low res Test": {
      render_enabled: true,
      render_tag: "Cleanup",
      resolution_x: "1280",
      resolution_y: "720",
      render_formats: {
        mov: false,
        mp4: false,
        pngseq: true,
      },
    },
  };
  try {
    new QDir().mkpath(new QFileInfo(this.presetsFile).absolutePath()); // Create settings folder
    this.presetsFile.open(QIODevice.WriteOnly);
    this.presetsFile.write(
      new QByteArray().append(JSON.stringify(examplePresets, null, 2))
    );
  } catch (error) {
    MessageLog.trace(error);
  } finally {
    this.presetsFile.close();
  }
};

EzRender.prototype.getselectedDisplayNodes = function () {
  return node.getNodes(["DISPLAY"]);
};

// User interface functions
EzRender.prototype.setupAdvancedUI = function () {
  // Load User Interface
  // var packageView = ScriptManager.getView("EZ Render");
  // this.ui = ScriptManager.loadViewUI(
  //   packageView,
  //   this.packageInfo.packageFolder + "/EZRender.ui"
  // );

  this.ui = UiLoader.load(this.packageInfo.packageFolder + "/EZRender.ui");
  // this.ui.setParent(this);
  // this.ui = ScriptManager.loadViewUI(
  //   this,
  //   this.packageInfo.packageFolder + "/EZRender.ui"
  // );

  if (!about.isMacArch()) {
    this.ui.setWindowFlags(new Qt.WindowFlags(Qt.Window));
    this.ui.setWindowTitle("EZ Render by Visual Droids");
  } else {
    this.ui.setWindowFlags(
      new Qt.WindowFlags(
        Qt.Tool |
          Qt.CustomizeWindowHint |
          Qt.WindowCloseButtonHint |
          Qt.WindowStaysOnTopHint
      )
    );
    this.ui.setWindowTitle("EZ Render by Visual Droids");
  }
  // this.ui.setAttribute(Qt.WA_DeleteOnClose);
  // // Insert about information
  // this.ui.about = require(this.packageInfo.packageFolder + "/lib/about.js")(
  //   this.packageInfo,
  //   this.ui.main
  // );
  // Add icons and graphics
  this.ui.main.presetBox.buttonAddPreset.icon = new QIcon(
    this.packageInfo.packageFolder + "/icons/plus.png"
  );
  this.ui.main.presetBox.buttonDeletePreset.icon = new QIcon(
    this.packageInfo.packageFolder + "/icons/remove.png"
  );
  this.ui.main.presetBox.buttonEditPreset.icon = new QIcon(
    this.packageInfo.packageFolder + "/icons/edit.png"
  );
  this.ui.main.presetBox.buttonDuplPreset.icon = new QIcon(
    this.packageInfo.packageFolder + "/icons/duplicate.png"
  );

  // this.ui.setStyleSheet(fileio.readFile(path)) // Apply Stylesheet
  // const uiPresetList = this.ui.main.presetBox.presetListWidget;
  // const uiRenderButton = this.ui.main.buttonRender;
  // const uiAddPresetButton = this.ui.main.presetBox.buttonAddPreset;
  // const uiRemovePresetButton = this.ui.main.presetBox.buttonDeletePreset;
  // const uiEditPresetButton = this.ui.main.presetBox.buttonEditPreset;
  // const uiDuplicatePresetButton = this.ui.main.presetBox.buttonDuplPreset;
  // const uiPresetInfoLabel = this.ui.main.presetBox.presetInfoLabel;
  // const uiScenePath = this.ui.main.renderOutputBox.outputPath;
  // const uibrowseForFileButton = this.ui.main.renderOutputBox.browseForFileButton;

  // Set scene path in the ui
  this.ui.main.renderOutputBox.outputPath.setText(this.outputFolder);

  // Make list checkable for selecting multiple presets
  this.ui.main.presetBox.presetListWidget.flags = Qt.ItemIsUserCheckable;
  this.ui.main.displayBox.displaySelector.flags = Qt.ItemIsUserCheckable;

  // Show display nodes in Display box
  // scene.getDefaultDisplay()

  this.ui.main.displayBox.displaySelector.itemChanged.connect(
    this,
    function (currentItem) {
      var currentDisplayNodePath = currentItem.text();
      var currentDisplayNodeEnabled = currentItem.checkState() == Qt.Checked;

      this.log(
        "Display cambio: " +
          currentDisplayNodePath +
          " > " +
          currentDisplayNodeEnabled
      );
      node.setEnable(currentDisplayNodePath, currentDisplayNodeEnabled);
      this.displayNodes[currentDisplayNodePath] = {};
      this.displayNodes[currentDisplayNodePath].enabled =
        currentDisplayNodeEnabled;
    }
  );

  // // Connect signals to functions
  // ----------- Add Preset Signal ----------- //
  this.ui.main.presetBox.buttonAddPreset.clicked.connect(this, function () {
    this.editMode = "add";
    this.presetEditUI.call(this); // Add functionality to edit preset button
  });
  // ----------- Edit Preset Signal ----------- //
  this.ui.main.presetBox.buttonEditPreset.clicked.connect(this, function () {
    this.editMode = "edit";
    this.selectedPreset = this.ui.main.presetBox.presetListWidget
      .currentItem()
      .text();
    this.presetEditUI.call(this); // Add functionality to edit preset button
  });
  this.ui.main.presetBox.presetListWidget.itemDoubleClicked.connect(
    this,
    function () {
      this.editMode = "edit";
      this.selectedPreset = this.ui.main.presetBox.presetListWidget
        .currentItem()
        .text();
      this.presetEditUI.call(this); // Add functionality to edit preset button
    }
  );
  // ----------- Duplicate Preset Signal ----------- //
  this.ui.main.presetBox.buttonDuplPreset.clicked.connect(this, function () {
    this.editMode = "duplicate";
    this.selectedPreset = this.ui.main.presetBox.presetListWidget
      .currentItem()
      .text();
    this.presetEditUI.call(this); // Add functionality to edit preset button
  });
  // ----------- Delete Preset Signal ----------- //
  this.ui.main.presetBox.buttonDeletePreset.clicked.connect(this, function () {
    var selectedItem = this.ui.main.presetBox.presetListWidget
      .currentItem()
      .text();
    var confirmationDialog = new QMessageBox();
    confirmationDialog.text =
      'Are you sure you want to remove "' + selectedItem + '"?';
    confirmationDialog.addButton(QMessageBox.Yes);
    confirmationDialog.addButton(QMessageBox.No);
    var confirmationAnswer = confirmationDialog.exec();
    if (confirmationAnswer == QMessageBox.Yes) {
      this.presets.remove(selectedItem);
      var messageDialog = new QMessageBox(
        false,
        "",
        "Preset removed",
        QMessageBox.Ok,
        this.ui
      );
      this.refreshPresetsAndDisplays();
      messageDialog.exec();
    }
  });

  this.ui.main.renderOutputBox.browseForFileButton.clicked.connect(
    this,
    function () {
      try {
        previousscenepath = this.outputFolder;

        var scenepath = QFileDialog.getExistingDirectory(
          0,
          "Choose a directory for placing your renders",
          previousscenepath
        );

        if (scenepath == "") {
          scenepath = previousscenepath;
        }

        scenepath = scenepath.split("\\").join("/");

        this.ui.main.renderOutputBox.outputPath.setText(scenepath);
        this.outputFolder = scenepath;
      } catch (error) {
        this.log(error);
      }
    }
  );
  this.ui.main.presetBox.presetListWidget.itemClicked.connect(
    this,
    function (item) {
      var renderPresets = this.presets.data;

      try {
        this.ui.main.presetBox.presetInfoBox.presetNameInfoLabel.setHidden(
          false
        );
        this.ui.main.presetBox.presetInfoBox.presetTagInfoLabel.setHidden(
          false
        );
        this.ui.main.presetBox.presetInfoBox.presetResInfoLabel.setHidden(
          false
        );
        this.ui.main.presetBox.presetInfoBox.presetInfoMov.setHidden(false);
        this.ui.main.presetBox.presetInfoBox.presetInfoPNG.setHidden(false);
        this.ui.main.presetBox.presetInfoBox.presetNameInfoLabel.setText(
          '"' + item.text() + '"'
        );
        this.ui.main.presetBox.presetInfoBox.presetTagInfoLabel.setText(
          "Render Tag: " + renderPresets[item.text()].render_tag
        );
        this.ui.main.presetBox.presetInfoBox.presetResInfoLabel.setText(
          "Resolution: " +
            renderPresets[item.text()].resolution_x +
            "x" +
            renderPresets[item.text()].resolution_y
        );
        this.ui.main.presetBox.presetInfoBox.presetInfoMov.setChecked(
          renderPresets[item.text()].render_formats.mov
        );
        this.ui.main.presetBox.presetInfoBox.presetInfoPNG.setChecked(
          renderPresets[item.text()].render_formats.pngseq
        );
      } catch (error) {
        this.log(error);
      }
    }
  );
  this.ui.main.presetBox.presetListWidget.itemChanged.connect(
    this,
    function (item) {
      // una hora de investigacion, transforma la respuesta de check state (que es checked, not checked, partially checked) en un booleano)
      this.presets.edit(
        (presetName = item.text()),
        (renderEnabled = item.checkState() == Qt.Checked)
      );
    }
  );

  this.ui.main.frameBox.setStartFrameButton.clicked.connect(this, function () {
    scene.setStartFrame(frame.current());
    // Timeline.centerOnFrame(frame.current());
  });

  this.ui.main.frameBox.setEndFrameButton.clicked.connect(this, function () {
    scene.setStopFrame(frame.current());
    // Timeline.centerOnFrame(frame.current());
  });

  this.ui.main.buttonRender.clicked.connect(this, function () {
    this.renderMode = "Advanced";
    this.ui.setCurrentWidget(this.ui.progress);
    // this.ui.setCurrentWidget(this)
    this.ui.progress.openRendersFolder.setVisible(false);
    this.ui.progress.goBack.setVisible(false);
    this.ui.progress.progressBar.setVisible(true);
    this.renderEngine.call(this);
    this.ui.progress.openRendersFolder.setVisible(true);
    this.ui.progress.goBack.setVisible(true);
    this.ui.progress.progressBar.setVisible(false);
    this.beep.win.play();
    this.ui.progress.progressText.text = "Render complete 😊";
  });

  // Disable some buttons if no presets are selected
  this.ui.main.presetBox.presetListWidget.itemSelectionChanged.connect(
    this,
    function () {
      var enablebuttons =
        this.ui.main.presetBox.presetListWidget.selectedItems() == ""
          ? false
          : true;
      // this.ui.main.presetBox.presetInfoBox.setVisible(enablebuttons);
      this.ui.main.presetBox.buttonDeletePreset.setEnabled(enablebuttons);
      this.ui.main.presetBox.buttonEditPreset.setEnabled(enablebuttons);
      this.ui.main.presetBox.buttonDuplPreset.setEnabled(enablebuttons);
      this.ui.main.presetBox.presetInfoBox.presetNameInfoLabel.setVisible(
        enablebuttons
      );
      this.ui.main.presetBox.presetInfoBox.presetTagInfoLabel.setVisible(
        enablebuttons
      );
      this.ui.main.presetBox.presetInfoBox.presetResInfoLabel.setVisible(
        enablebuttons
      );
      this.ui.main.presetBox.presetInfoBox.presetInfoMov.setVisible(
        enablebuttons
      );
      this.ui.main.presetBox.presetInfoBox.presetInfoPNG.setVisible(
        enablebuttons
      );
    }
  );
  this.ui.main.presetBox.presetListWidget.itemSelectionChanged(); // Emit the signal on window creation so it checks if the buttons should be enabled

  // Give it some STYLE
  this.ui.main.buttonRender.setStyleSheet("color: white; border-radius: 5px;");

  // // Scene notifier patch for detecting when display nodes are added or deleted and show them in the ui
  // this.notifier = new SceneChangeNotifier(this.ui);
  // // this.notifier.disconnectAll();
  // this.notifier.networkChanged.connect(this, function (list) {
  //     this.refreshUIDisplayNodes();
  // });

  ////////////////////////// EDIT UI /////////////////////////////

  this.ui.edit.messageDialog = new QMessageBox(this.ui.edit);

  // ----------- Checking if fields are populated ----------- //
  this.ui.edit.infoBox.presetName.textChanged.connect(this, checkFields);
  this.ui.edit.infoBox.presetHResolution.currentTextChanged.connect(
    this,
    checkFields
  );
  this.ui.edit.infoBox.presetVResolution.currentTextChanged.connect(
    this,
    checkFields
  );
  this.ui.edit.formatsBox.isMOVVideoFile.stateChanged.connect(
    this,
    checkFields
  );
  this.ui.edit.formatsBox.isMP4VideoFile.stateChanged.connect(
    this,
    checkFields
  );
  this.ui.edit.formatsBox.isPNGSequence.stateChanged.connect(this, checkFields);
  checkFields.call(this);

  function checkFields() {
    this.ui.edit.saveButton.enabled =
      this.ui.edit.infoBox.presetName.text.length > 0 &&
      this.ui.edit.infoBox.presetHResolution.currentText.length > 0 &&
      this.ui.edit.infoBox.presetVResolution.currentText.length > 0 &&
      (this.ui.edit.formatsBox.isMOVVideoFile.checked ||
        this.ui.edit.formatsBox.isMP4VideoFile.checked ||
        this.ui.edit.formatsBox.isPNGSequence.checked);
  }
  // ----------- End Checking if fields are populated ----------- //

  this.ui.edit.saveButton.clicked.connect(this, function () {
    var renderPresets = this.presets.data;
    try {
      if (this.editMode == "edit") {
        this.log("Editing a preset now...");
        if (this.ui.edit.infoBox.presetName.text != this.selectedPreset) {
          //
          // Check if new edited preset name is not equal to an stored one, to avoid overwriting it
          if (this.ui.edit.infoBox.presetName.text in renderPresets) {
            this.ui.edit.messageDialog.text =
              "A preset with the same name already exists";
            this.ui.edit.messageDialog.exec();
            return;
            // this.refreshPresetsAndDisplays();
          }

          this.presets.remove(this.selectedPreset);
          this.presets.add(
            (presetName = this.ui.edit.infoBox.presetName.text),
            (renderTag = this.ui.edit.infoBox.renderTag.currentText),
            (resX = this.ui.edit.infoBox.presetHResolution.currentText),
            (resY = this.ui.edit.infoBox.presetVResolution.currentText),
            (mov = this.ui.edit.formatsBox.isMOVVideoFile.checked),
            (mp4 = this.ui.edit.formatsBox.isMP4VideoFile.checked),
            (pngseq = this.ui.edit.formatsBox.isPNGSequence.checked)
          );
        } else {
          // this.presets.remove(this.selectedPreset);
          this.presets.edit(
            (presetName = this.ui.edit.infoBox.presetName.text),
            (renderEnabled = renderPresets[this.selectedPreset].render_enabled),
            (renderTag = this.ui.edit.infoBox.renderTag.currentText),
            (resX = this.ui.edit.infoBox.presetHResolution.currentText),
            (resY = this.ui.edit.infoBox.presetVResolution.currentText),
            (mov = this.ui.edit.formatsBox.isMOVVideoFile.checked),
            (mp4 = this.ui.edit.formatsBox.isMP4VideoFile.checked),
            (pngseq = this.ui.edit.formatsBox.isPNGSequence.checked)
          );
        }
      }
      if (this.editMode == "add" || this.editMode == "duplicate") {
        if (this.ui.edit.infoBox.presetName.text in renderPresets) {
          this.ui.edit.messageDialog.text =
            "A preset with the same name already exists";
          this.ui.edit.messageDialog.exec();
          return;
          // this.refreshPresetsAndDisplays();
        }
        this.presets.add(
          this.ui.edit.infoBox.presetName.text,
          this.ui.edit.infoBox.renderTag.currentText,
          this.ui.edit.infoBox.presetHResolution.currentText,
          this.ui.edit.infoBox.presetVResolution.currentText,
          this.ui.edit.formatsBox.isMOVVideoFile.checked,
          this.ui.edit.formatsBox.isMP4VideoFile.checked,
          this.ui.edit.formatsBox.isPNGSequence.checked
        );
      }

      this.refreshPresetsAndDisplays();
      this.ui.setCurrentWidget(this.ui.main);
    } catch (error) {
      this.log(error);
    }
  });

  this.ui.edit.cancelButton.clicked.connect(this, function () {
    this.ui.setCurrentWidget(this.ui.main);
  });

  //////////////////// PROGRESS UI /////////////////////////
  this.ui.progress.cancelRenderButton.setVisible(false);
  this.ui.progress.cancelRenderButton.clicked.connect(this, function () {
    try {
      render.cancelRender();
      this.renderFinished();
      // render.frameReady.disconnect(this, this.frameReady);
      // this.log("Deleting >> " + outputPath);
      // new QDir(outputPath).removeRecursively();
    } catch (error) {
      this.log(error);
    }
  });

  this.ui.progress.openRendersFolder.clicked.connect(this, function () {
    this.ui.setCurrentWidget(this.ui.main);
    this.openFolder.call(this, this.outputFolder);
  });

  this.ui.progress.goBack.clicked.connect(this, function () {
    this.ui.setCurrentWidget(this.ui.main);
  });
};

EzRender.prototype.showAdvancedUI = function () {
  try {
    // this.refreshUIDisplayNodes();
    this.ui.setCurrentWidget(this.ui.main);
    this.refreshPresetsAndDisplays.call(this);
    this.ui.show();
    this.ui.activateWindow(); // Set current window to the top
  } catch (error) {
    this.log(error);
  }
};

EzRender.prototype.presetEditUI = function () {
  if (typeof this.selectedPreset === "undefined") this.selectedPreset = "";

  try {
    this.log("Mode is : " + this.editMode);

    // Reset the User Interface & Disconnect signals
    this.ui.edit.infoBox.presetName.clear();
    this.ui.edit.infoBox.renderTag.clearEditText();
    this.ui.edit.infoBox.presetHResolution.clearEditText();
    this.ui.edit.infoBox.presetVResolution.clearEditText();
    this.ui.edit.formatsBox.isMOVVideoFile.setChecked(false);
    this.ui.edit.formatsBox.isMP4VideoFile.setChecked(false);
    this.ui.edit.formatsBox.isPNGSequence.setChecked(false);

    var renderPresets = this.presets.data;

    if (this.editMode == "edit" || this.editMode == "duplicate") {
      if (this.editMode == "edit") {
        this.ui.edit.infoBox.presetName.setText(this.selectedPreset);
        // this.ui.edit.infoBox.presetName.enabled = false; // Disable preset name editing
      }
      if (this.editMode == "duplicate")
        this.ui.edit.infoBox.presetName.setText(this.selectedPreset + " Copy");
      this.ui.edit.infoBox.renderTag.setCurrentText(
        renderPresets[this.selectedPreset].render_tag
      );
      this.ui.edit.infoBox.presetHResolution.setCurrentText(
        renderPresets[this.selectedPreset].resolution_x
      );
      this.ui.edit.infoBox.presetVResolution.setCurrentText(
        renderPresets[this.selectedPreset].resolution_y
      );
      this.ui.edit.formatsBox.isMOVVideoFile.setChecked(
        renderPresets[this.selectedPreset].render_formats.mov
      );
      this.ui.edit.formatsBox.isMP4VideoFile.setChecked(
        renderPresets[this.selectedPreset].render_formats.mp4
      );
      this.ui.edit.formatsBox.isPNGSequence.setChecked(
        renderPresets[this.selectedPreset].render_formats.pngseq
      );
    }

    this.ui.setCurrentWidget(this.ui.edit);
  } catch (error) {
    this.log(error);
  }
};

EzRender.prototype.refreshUIDisplayNodes = function () {
  // this.ui.main.displayBox.displaySelector.clear();
  // this.ui.main.displayBox.displaySelector.addItems(this.getselectedDisplayNodes());
  this.refreshPresetsAndDisplays.call(this);
};

EzRender.prototype.refreshPresetsAndDisplays = function () {
  this.ui.main.presetBox.presetListWidget.clear(); // Clear advanced ui preset list
  // this.toolbarui.presetList.clear(); // Clear Toolbar preset list

  this.ui.main.displayBox.displaySelector.clear(); // Clear advanced ui display list

  var currentDisplayNodes = this.getselectedDisplayNodes();
  for (var displayNode in currentDisplayNodes) {
    var item = new QListWidgetItem(
      currentDisplayNodes[displayNode],
      this.ui.main.displayBox.displaySelector
    );
    item.setCheckState(
      node.getEnable(currentDisplayNodes[displayNode]) == true ? 2 : 0
    ); // una hora de investigacion, transforma el booleano en la respuesta de check state (que es checked, not checked, partially checked)
    this.ui.main.displayBox.displaySelector.addItem(item);
  }

  var currentPresets = this.presets.data;
  for (var preset in currentPresets) {
    // Add item to the advanced ui preset list
    var item = new QListWidgetItem(
      preset,
      this.ui.main.presetBox.presetListWidget
    );
    item.setCheckState(currentPresets[preset].render_enabled == true ? 2 : 0); // una hora de investigacion, transforma el booleano en la respuesta de check state (que es checked, not checked, partially checked)
    this.ui.main.presetBox.presetListWidget.addItem(item);

    // Add item to the toolbar ui preset list
    // this.toolbarui.presetList.addItem(preset);
  }
  // this.toolbarui.presetList.adjustSize(); // Does not work for resizing toolbar
};

// Toolbar user interface functions
EzRender.prototype.hookToolbar = function () {
  this.hook = new (require(this.packageInfo.packageFolder +
    "/lib/ToolbarHook/toolbarhook.js").ToolbarHook)(
    this.packageInfo,
    this.setupToolbarUI(),
    true,
    this.debug
  );
};

EzRender.prototype.setupToolbarUI = function () {
  this.toolbarui = UiLoader.load(
    this.packageInfo.packageFolder + "/toolbar.ui"
  );

  this.toolbarui.setAttribute(Qt.WA_DeleteOnClose);

  this.toolbarui.progressBar.setVisible(false);

  this.toolbarui.setStartFrameButton.clicked.connect(this, function () {
    scene.setStartFrame(frame.current());
    // Timeline.centerOnFrame(frame.current());
  });
  this.toolbarui.setEndFrameButton.clicked.connect(this, function () {
    scene.setStopFrame(frame.current());
    // Timeline.centerOnFrame(frame.current());
  });

  this.toolbarui.quickRenderButton.clicked.connect(this, function () {
    this.toolbarui.setStartFrameButton.setVisible(false);
    this.toolbarui.setEndFrameButton.setVisible(false);
    this.toolbarui.quickRenderButton.setVisible(false);
    this.toolbarui.progressBar.setVisible(true);
    this.renderMode = "Simple";
    this.selectedPreset = this.toolbarui.presetList.currentText;
    this.renderEngine.call(this);
    this.toolbarui.progressBar.setVisible(false);
    this.toolbarui.setStartFrameButton.setVisible(true);
    this.toolbarui.setEndFrameButton.setVisible(true);
    this.toolbarui.quickRenderButton.setVisible(true);
  });

  this.toolbarui.advancedButton.clicked.connect(this, function () {
    this.showAdvancedUI();
  });

  this.toolbarui.advancedButton.icon = new QIcon(
    this.packageInfo.packageFolder + "/icons/EZRender.png"
  );

  // this.toolbarui.presetList.setStyleSheet(
  //     "border-radius: 5px;"
  //     //#comboBox{border: 1px solid #ced4da;border-radius: 4px;padding-left: 10px;}#comboBox::on{border: 4px solid #c2dbfe;}#comboBox::QListView {font-size: 12px; border: 1px solid rgba(0, 0, 0, 10%);padding: 5px; background-color: #fff;outline: 0px;}
  // );
  this.toolbarui.setStartFrameButton.setStyleSheet(
    "color: white; border-radius: 5px;"
  );
  this.toolbarui.setEndFrameButton.setStyleSheet(
    "color: white; border-radius: 5px;"
  );
  this.toolbarui.quickRenderButton.setStyleSheet(
    "color: white; border-radius: 5px;"
  );
  this.toolbarui.advancedButton.setStyleSheet(
    "color: white; border-radius: 5px;"
  );

  return this.toolbarui;
};

// Rendering functions
/**
 *
 * @param { string } mode Choose between Simple or Advanced mode
 * @param { string } presetName For Simple Mode: Render a specific preset from the preset file. If missing will render all enabled presets
 */
EzRender.prototype.renderEngine = function () {
  try {
    this.createFolder(this.outputFolder); // Create output folder in case that it had disappeared misteriously

    var renderPresets = this.presets.data;
    var renderDisplays = [];
    var enabledPresets = [];
    var progressWidget;

    // Simple mode renders a single preset selected from the toolbar ui and the
    if (this.renderMode == "Simple") {
      // progressWidget = this.toolbarui;
      renderDisplays.push(scene.getDefaultDisplay());
      enabledPresets.push(this.selectedPreset);
    }
    // Advanced mode renders all enabled presets and the display node selected from the advanced ui
    else if (this.renderMode == "Advanced") {
      progressWidget = this.ui.progress;

      for (var displayNode in this.displayNodes) {
        if (this.displayNodes[displayNode].enabled) {
          renderDisplays.push(displayNode);
        }
      }
      for (var preset in renderPresets) {
        if (renderPresets[preset].render_enabled) {
          enabledPresets.push(preset);
        }
      }
    }

    for (var preset in enabledPresets) {
      for (var renderDisplay in renderDisplays) {
        var currentDisplay = renderDisplays[renderDisplay];
        var currentPreset = enabledPresets[preset]; // Because it's a list, "preset" is an index

        var renderOutputFolder = this.outputFolder;
        var renderFullOutputPath =
          renderOutputFolder +
          "/" +
          scene.currentScene() +
          "-" +
          renderPresets[currentPreset].render_tag +
          "-" +
          currentDisplay.split("/").pop();

        if (this.renderMode == "Advanced") {
          this.log(
            "Rendering " +
              currentPreset +
              " using " +
              currentDisplay +
              " display..."
          );
          progressWidget.progressText.text =
            "Rendering " +
            currentPreset +
            " using " +
            currentDisplay +
            " display...";
        }

        if (renderPresets[currentPreset].render_formats.mov) {
          this.movRenderer.call(
            this,
            // renderFullOutputPath + "-" + this.getCurrentDateTime() + ".mov",
            this.versionedPath(renderFullOutputPath + ".mov"),
            renderPresets[currentPreset].resolution_x,
            renderPresets[currentPreset].resolution_y,
            currentDisplay.split("/").pop(),
            progressWidget
          );
        }
        if (renderPresets[currentPreset].render_formats.pngseq) {
          this.pngRenderer.call(
            this,
            // renderFullOutputPath + "-" + this.getCurrentDateTime(),
            this.versionedPath(renderFullOutputPath),
            renderPresets[currentPreset].resolution_x,
            renderPresets[currentPreset].resolution_y,
            currentDisplay,
            progressWidget
          );
        }
      }
    }

    // Open render output folder when called from the toolbar
    if (this.renderMode == "Simple") {
      this.openFolder.call(this, this.outputFolder);
    }
  } catch (error) {
    this.log(error);
  }
};

EzRender.prototype.movRenderer = function (
  outputPath,
  resolutionX,
  resolutionY,
  selectedDisplay,
  progressWidget
) {
  try {
    if (about.isMacArch()) {
      // this.toolbarui.progressBar.setVisible(false);

      exporter.exportToQuicktime(
        (displayName = ""),
        (startFrame = scene.getStartFrame()),
        (lastFrame = scene.getStopFrame()),
        (withSound = true),
        (resX = resolutionX),
        (resY = resolutionY),
        (dstPath = outputPath),
        (displayModule = selectedDisplay),
        (generateThumbnail = false),
        (thumbnailFrame = 0)
      );
    } else {
      // Create a temporary folder for holding png sequence
      var tmpFolder = new QDir(
        fileMapper.toNativePath(
          specialFolders.temp + "/" + Math.random().toString(36).slice(-8) + "/"
        )
      );
      if (!tmpFolder.exists()) {
        tmpFolder.mkpath(tmpFolder.path());
      }

      outputPath = fileMapper.toNativePath(outputPath);
      // var outputPathWithoutExtension = outputPath.split(".").slice(0, -1).join(".");
      var renderedFrames = [];

      var currentPercentage = scene.getStartFrame();
      progressWidget.progressBar.setRange(
        scene.getStartFrame(),
        scene.getStopFrame()
      );
      progressWidget.progressBar.value = currentPercentage;

      var numberOfFrames = scene.getStopFrame() - scene.getStartFrame() + 1;

      for (var thisFrame = 1; thisFrame <= numberOfFrames; thisFrame++) {
        this.frameReady = function (frame, celImage) {
          QCoreApplication.processEvents();
          var outFrame =
            tmpFolder.path() + "/" + ("000000" + thisFrame).slice(-6) + ".png";
          celImage.imageFileAs(outFrame, "", "PNG");
          renderedFrames.push(outFrame);

          currentPercentage += 1;
          this.log("Current frame: " + currentPercentage);
          progressWidget.progressBar.value = currentPercentage;
          QCoreApplication.processEvents();
        };

        this.renderFinished = function () {
          render.renderFinished.disconnect(this, this.renderFinished);
          render.frameReady.disconnect(this, this.frameReady);
          QCoreApplication.processEvents();
        };

        render.renderFinished.connect(this, this.renderFinished);
        render.setResolution(resolutionX, resolutionY);
        render.frameReady.connect(this, this.frameReady);
        render.setRenderDisplay(selectedDisplay);

        render.renderScene(thisFrame, thisFrame);
      }

      renderedFrames.sort(function (a, b) {
        return a < b ? -1 : 1;
      });

      this.ui.progress.progressText.text = "Creating MOV file...";
      this.ui.progress.progressBar.setMaximum(0);
      this.ui.progress.progressBar.setMinimum(0);
      this.ui.progress.progressBar.setValue(0);

      WebCCExporter.exportMovieFromFiles(
        (movieFilename = outputPath),
        (framesFilenames = renderedFrames),
        (firstFrame = scene.getStartFrame()),
        (lastFrame = scene.getStopFrame()),
        (withSound = true),
        (maxQp = 25),
        (iFramePeriod = 1)
      );

      tmpFolder.removeRecursively();

      QCoreApplication.processEvents();

      this.ui.progress.progressBar.setMaximum(100);
      this.ui.progress.progressBar.setMinimum(0);
    }
  } catch (error) {
    this.log(error);
  }
};

EzRender.prototype.pngRenderer = function (
  outputPath,
  resolutionX,
  resolutionY,
  selectedDisplay,
  progressWidget
) {
  try {
    // Create a temporary folder for holding png sequence
    var tmpFolder = new QDir(
      fileMapper.toNativePath(
        specialFolders.temp + "/" + Math.random().toString(36).slice(-8) + "/"
      )
    );
    if (!tmpFolder.exists()) {
      tmpFolder.mkpath(tmpFolder.path());
    }

    outputPath = fileMapper.toNativePath(outputPath);
    var renderedFrames = [];

    var currentPercentage = scene.getStartFrame();
    progressWidget.progressBar.setRange(
      scene.getStartFrame(),
      scene.getStopFrame()
    );
    progressWidget.progressBar.value = currentPercentage;

    var numberOfFrames = scene.getStopFrame() - scene.getStartFrame() + 1;

    for (var thisFrame = 1; thisFrame <= numberOfFrames; thisFrame++) {
      this.frameReady = function (frame, celImage) {
        this.log(
          "\nCurrent Percentage: " +
            currentPercentage +
            "\nCurrent Frame: " +
            frame +
            "\n "
        );
        var outFrame =
          tmpFolder.path() + "/" + ("000000" + thisFrame).slice(-6) + ".png";
        celImage.imageFileAs(outFrame, "", "PNG4");
        renderedFrames.push(outFrame);
        currentPercentage += 1;
        progressWidget.progressBar.value = currentPercentage;
        QCoreApplication.processEvents();
      };

      this.renderFinished = function () {
        render.renderFinished.disconnect(this, this.renderFinished);
        render.frameReady.disconnect(this, this.frameReady);
        QCoreApplication.processEvents();
      };

      render.renderFinished.connect(this, this.renderFinished);
      render.setResolution(resolutionX, resolutionY);
      render.frameReady.connect(this, this.frameReady);
      render.setRenderDisplay(selectedDisplay);

      render.renderScene(thisFrame, thisFrame);
    }

    // var zipper = new (require(this.packageInfo.packageFolder +
    //   "/lib/FileArchiver/sevenzip.js").SevenZip)(
    //   (parentContext = this),
    //   (source = tmpFolder.path()),
    //   (destination = outputPath),
    //   (debug = this.debug)
    // );

    // zipper.zip();

    this.copyFolderRecursively(tmpFolder.path(), outputPath);

    tmpFolder.removeRecursively();
  } catch (error) {
    this.log(error);
  }
};

// File system handling functions
EzRender.prototype.createFolder = function (path) {
  var newFolder = new QDir(path);
  if (!newFolder.exists()) {
    newFolder.mkpath(path);
    this.log(newFolder.path() + " folder created");
  }
};

EzRender.prototype.openFolder = function (folder) {
  QDesktopServices.openUrl(QUrl.fromLocalFile(folder));
};

EzRender.prototype.copyFolderRecursively = function (
  sourceFolder,
  destinationFolder
) {
  var sourceDir = new QDir(sourceFolder);
  var destinationDir = new QDir(destinationFolder);

  if (!sourceDir.exists()) {
    this.log("Source folder does not exist.");
    return;
  }

  if (!destinationDir.exists()) {
    destinationDir.mkpath(destinationFolder);
  }

  var fileInfoList = sourceDir.entryInfoList(
    QDir.Filters(QDir.Files | QDir.Dirs | QDir.NoDotAndDotDot)
  );

  for (var i = 0; i < fileInfoList.length; i++) {
    var fileInfo = fileInfoList[i];
    var sourcePath = fileInfo.absoluteFilePath();
    var destinationPath = destinationDir.absoluteFilePath(fileInfo.fileName());

    if (fileInfo.isDir()) {
      this.copyFolderRecursively(sourcePath, destinationPath);
    } else {
      var file = new QFile(sourcePath);
      if (file.exists() && file.copy(destinationPath)) {
        this.log("File copied: " + destinationPath);
      } else {
        this.log("Error copying file: " + destinationPath);
      }
    }
  }
};

EzRender.prototype.versionedPath = function (originalPath) {
  var pathInfo = new QFileInfo(originalPath);

  var basePath = pathInfo.absoluteDir().filePath(pathInfo.baseName());
  var extension = pathInfo.completeSuffix();

  if (!pathInfo.exists()) return originalPath;

  var version = 1;
  var newPath = basePath + "_" + version;
  if (extension) newPath += "." + extension;

  while (new QFileInfo(newPath).exists()) {
    version++;
    newPath = basePath + "_" + version;
    if (extension) newPath += "." + extension;
  }

  return newPath;
};

EzRender.prototype.getCurrentDateTime = function () {
  var now = new Date();
  return (
    now.getFullYear() +
    "" +
    ("0" + (now.getMonth() + 1)).slice(-2) +
    "" +
    ("0" + now.getDate()).slice(-2) +
    "-" +
    ("0" + now.getHours()).slice(-2) +
    "" +
    ("0" + now.getMinutes()).slice(-2) +
    "" +
    ("0" + now.getSeconds()).slice(-2)
  );
};

// Logging and debuging functions
EzRender.prototype.log = function (string) {
  if (this.debug == true)
    MessageLog.trace(
      "[ " + this.packageInfo.packageFullName + " ] > " + string
    );
};

exports.EzRender = EzRender;
