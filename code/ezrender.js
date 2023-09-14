/**
 * @file EZ Render for Toonboom Harmony
 * @version 23.9
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
    fail: new (require(this.packageInfo.packageFolder +
      "/lib/AudioPlayer/audioplayer.js").AudioPlayer)(
      this.packageInfo.packageFolder + "/sound/fail.wav"
    ),
  };

  // Init sequence
  // this.setupToolbarUI(); // Setup Toolbar UI
  // this.hookToolbar(); // Hook Toolbar UI to the Toonboom Harmony toolbar
  this.setupAdvancedUI(); // Setup Advanced UI
  // this.refreshPresetsAndDisplays(); // Update Presets at startup | Needs both the toolbar ui & the advanced ui loaded

  this.supportedFormats = {
    mov: { title: ".mov (h264)" },
    pngseq: { title: ".png (PNG Sequence)" },
  };

  // State
  this.interruptRender = false;
  this.renderSuccess = false;
  this.presetToEdit = null;
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

// Verify the validity of the presets file
presetsObject.prototype.verify = function () {};

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

presetsObject.prototype.remove = function (indexToRemove) {
  indexToRemove++; // Translating from table to object. Table begins at 0, object begins at 1

  var obj = this.data;
  if (!obj.hasOwnProperty(indexToRemove))
    throw new Error('Preset with index #"' + indexToRemove + '" not found');

  delete obj[indexToRemove];

  var newObj = {};
  var newIndex = 1;

  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      newObj[newIndex] = obj[i];
      newIndex++;
    }
  }

  this.data = newObj;

  // var obj = this.data;
  // if (!obj.hasOwnProperty(indexToRemove))
  //   throw new Error('Preset with index #"' + indexToRemove + '" not found');
  // delete obj[indexToRemove];
  // this.data = obj;

  // var obj = this.data;
  // var newObj = {};
  // for(var prop in obj) {
  //     var index = parseInt(prop);
  //     if(index < indexToRemove) {
  //         // If the index is less than the index to remove, copy the property as is
  //         newObj[prop] = obj[prop];
  //     } else if(index > indexToRemove) {
  //         // If the index is greater than the index to remove, reduce it by 1 and copy the property
  //         newObj[index - 1] = obj[prop];
  //     } // If the index equals to the index to remove, skip it
  // }
  // this.data = newObj;
};

presetsObject.prototype.initPresetsFile = function () {
  var examplePresets = {
    1: {
      preset_name: "Full HD PNG Sequence",
      render_enabled: false,
      render_tag: "Test",
      aspect_ratio: "16:9",
      resolution_x: "1920",
      resolution_y: "1080",
      render_formats: {
        mov: false,
        mp4: false,
        pngseq: true,
      },
      compress: false,
      output_name_format: "",
      output_fileseq_format: "",
    },
    2: {
      preset_name: "Full HD mov",
      render_enabled: false,
      render_tag: "Test",
      aspect_ratio: "16:9",
      resolution_x: "1920",
      resolution_y: "1080",
      render_formats: {
        mov: false,
        mp4: false,
        pngseq: true,
      },
      compress: false,
      output_name_format: "",
      output_fileseq_format: "",
    },
    3: {
      preset_name: "Low res Test",
      render_enabled: true,
      render_tag: "Cleanup",
      aspect_ratio: "16:9",
      resolution_x: "1280",
      resolution_y: "720",
      render_formats: {
        mov: false,
        mp4: false,
        pngseq: true,
      },
      compress: false,
      output_name_format: "",
      output_fileseq_format: "",
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

  // Scene Change Notifier
  var sceneNotifier = new SceneChangeNotifier(this.ui);
  sceneNotifier.nodeChanged.connect(this, function () {
    this.refreshPresetsAndDisplays();
  });
  sceneNotifier.networkChanged.connect(this, function () {
    this.refreshPresetsAndDisplays();
  });
  // sceneNotifier.currentFrameChanged.connect(function () {
  //   MessageLog.trace("Current Frame Changed");
  // });
  // sceneNotifier.controlChanged.connect(function () {
  //   MessageLog.trace("controlChanged changed");
  // });
  // sceneNotifier.nodeMetadataChanged.connect(function () {
  //   MessageLog.trace("nodeMetadataChanged changed");
  // });
  // sceneNotifier.sceneChanged.connect(function () {
  //   MessageLog.trace("scene changed");
  // });

  // Define a prototype for MyEventFilter that inherits from QObject
  var CustomEventFilter = function () {
    QObject.call(this);
  };
  CustomEventFilter.prototype = new QObject();
  CustomEventFilter.prototype.constructor = CustomEventFilter;

  // Override the eventFilter method in CustomEventFilter prototype
  CustomEventFilter.prototype.eventFilter = function (object, event) {
    try {
      // MessageLog.trace(event.type());
      if (event.type() == QEvent.Close) {
        sceneNotifier.disconnectAll();
        // MessageLog.trace("Signals Disconnected");
      }

      // return true;
    } catch (error) {
      MessageLog.trace(error);
    }
  };

  var eventFilter = new CustomEventFilter();
  this.ui.installEventFilter(eventFilter);

  var readFile = new require(
    this.packageInfo.packageFolder + "/lib/FileSystem/fs.js"
  ).readFile;
  this.ui.setStyleSheet(
    readFile(this.packageInfo.packageFolder + "/styles.qss")
  ); // Apply Stylesheet

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
  // this.ui.main.presetBox.buttonEditPreset.icon = new QIcon(
  //   this.packageInfo.packageFolder + "/icons/edit.png"
  // );
  this.ui.main.presetBox.buttonDuplPreset.icon = new QIcon(
    this.packageInfo.packageFolder + "/icons/duplicate.png"
  );

  // Set scene path in the ui
  this.ui.main.renderOutputBox.outputPath.setText(this.outputFolder);

  // Show display nodes in Display box
  // scene.getDefaultDisplay()

  // // Connect signals to functions
  // ----------- Add Preset Signal ----------- //
  this.ui.main.presetBox.buttonAddPreset.clicked.connect(this, function () {
    try {
      var obj = this.presets.data;
      var newIndex = Object.keys(obj).length + 1;
      obj[newIndex] = {};
      obj[newIndex]["render_enabled"] = false;
      obj[newIndex]["preset_name"] = "New Preset";
      obj[newIndex]["aspect_ratio"] = "Unlocked";
      obj[newIndex]["resolution_x"] = "";
      obj[newIndex]["resolution_y"] = "";
      obj[newIndex]["render_formats"] = {};
      for (var supportedFormat in this.supportedFormats) {
        obj[newIndex]["render_formats"][supportedFormat] = false;
      }
      obj[newIndex]["filename_format"] = "#SceneName#";
      this.presets.data = obj;

      this.refreshPresetsAndDisplays();
      this.ui.main.presetBox.presetsTable.selectRow(newIndex - 1);
      this.ui.main.presetBox.presetsTable.scrollToBottom();
    } catch (error) {
      MessageLog.trace(error);
    } finally {
    }
  });
  // // ----------- Edit Preset Signal ----------- //
  // this.ui.main.presetBox.buttonEditPreset.clicked.connect(this, function () {
  //   this.editMode = "edit";
  //   this.selectedPreset = this.ui.main.presetBox.presetListWidget
  //     .currentItem()
  //     .text();
  //   this.presetEditUI.call(this); // Add functionality to edit preset button
  // });
  // this.ui.main.presetBox.presetListWidget.itemDoubleClicked.connect(
  //   this,
  //   function () {
  //     this.editMode = "edit";
  //     this.selectedPreset = this.ui.main.presetBox.presetListWidget
  //       .currentItem()
  //       .text();
  //     this.presetEditUI.call(this); // Add functionality to edit preset button
  //   }
  // );
  // ----------- Duplicate Preset Signal ----------- //
  this.ui.main.presetBox.buttonDuplPreset.clicked.connect(this, function () {
    try {
      MessageLog.trace("Duplicating");

      var selectedItems = this.ui.main.presetBox.presetsTable.selectedItems();
      if (selectedItems.length > 0) {
        var selectedItem = {
          index: selectedItems[0].row(),
          presetName: this.ui.main.presetBox.presetsTable
            .item(selectedItems[0].row(), 1)
            .text(),
        };
        var obj = this.presets.data;
        var newIndex = Object.keys(obj).length + 1;
        obj[newIndex] = {};
        obj[newIndex]["render_enabled"] =
          obj[selectedItem.index + 1]["render_enabled"];
        obj[newIndex]["preset_name"] =
          obj[selectedItem.index + 1]["preset_name"];
        obj[newIndex]["aspect_ratio"] =
          obj[selectedItem.index + 1]["aspect_ratio"];
        obj[newIndex]["resolution_x"] =
          obj[selectedItem.index + 1]["resolution_x"];
        obj[newIndex]["resolution_y"] =
          obj[selectedItem.index + 1]["resolution_y"];
        obj[newIndex]["render_formats"] = {};
        for (var supportedFormat in this.supportedFormats) {
          obj[newIndex]["render_formats"][supportedFormat] =
            obj[selectedItem.index + 1]["render_formats"][supportedFormat];
        }
        obj[newIndex]["filename_format"] =
          obj[selectedItem.index + 1]["filename_format"];
        this.presets.data = obj;

        this.refreshPresetsAndDisplays();
        this.ui.main.presetBox.presetsTable.selectRow(newIndex - 1);
        this.ui.main.presetBox.presetsTable.scrollToBottom();
      }
    } catch (error) {
      MessageLog.trace(error);
    } finally {
    }
    // this.editMode = "duplicate";
    // this.selectedPreset = this.ui.main.presetBox.presetListWidget
    //   .currentItem()
    //   .text();
    // this.presetEditUI.call(this); // Add functionality to edit preset button
  });
  // ----------- Delete Preset Signal ----------- //
  this.ui.main.presetBox.buttonDeletePreset.clicked.connect(this, function () {
    try {
      var selectedItems = this.ui.main.presetBox.presetsTable.selectedItems();
      if (selectedItems.length > 0) {
        var selectedItem = {
          index: selectedItems[0].row(),
          presetName: this.ui.main.presetBox.presetsTable
            .item(selectedItems[0].row(), 1)
            .text(),
        };

        var confirmationDialog = new QMessageBox(this.ui);
        confirmationDialog.text =
          'Are you sure you want to remove "' + selectedItem.presetName + '"?';
        var yesButton = confirmationDialog.addButton(QMessageBox.Yes);
        var noButton = confirmationDialog.addButton(QMessageBox.No);

        confirmationDialog.buttonClicked.connect(
          this,
          function (clickedButton) {
            if (clickedButton === yesButton) {
              this.presets.remove(selectedItem.index);
              // var messageDialog = new QMessageBox(
              //   QMessageBox.NoIcon,
              //   "",
              //   "Preset removed",
              //   QMessageBox.Ok,
              //   this.ui
              // );
              this.refreshPresetsAndDisplays();
              // messageDialog.exec();
            }
          }
        );

        confirmationDialog.exec();
      }
    } catch (error) {
      MessageLog.trace(error);
    } finally {
    }
  });

  this.ui.main.renderOutputBox.resetOutputLocation.clicked.connect(
    this,
    function () {
      this.outputFolder = (scene.currentProjectPathRemapped() + "/renders")
        .split("\\")
        .join("/");
      this.createFolder(this.outputFolder);
      this.ui.main.renderOutputBox.outputPath.setText(this.outputFolder);
    }
  );

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
  // this.ui.main.presetBox.presetListWidget.itemClicked.connect(
  //   this,
  //   function (item) {
  //     var renderPresets = this.presets.data;

  //     try {
  //       this.ui.main.presetBox.presetInfoBox.presetNameInfoLabel.setHidden(
  //         false
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetTagInfoLabel.setHidden(
  //         false
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetResInfoLabel.setHidden(
  //         false
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetInfoMov.setHidden(false);
  //       this.ui.main.presetBox.presetInfoBox.presetInfoPNG.setHidden(false);
  //       this.ui.main.presetBox.presetInfoBox.presetNameInfoLabel.setText(
  //         '"' + item.text() + '"'
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetTagInfoLabel.setText(
  //         "Render Tag: " + renderPresets[item.text()].render_tag
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetResInfoLabel.setText(
  //         "Resolution: " +
  //           renderPresets[item.text()].resolution_x +
  //           "x" +
  //           renderPresets[item.text()].resolution_y
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetInfoMov.setChecked(
  //         renderPresets[item.text()].render_formats.mov
  //       );
  //       this.ui.main.presetBox.presetInfoBox.presetInfoPNG.setChecked(
  //         renderPresets[item.text()].render_formats.pngseq
  //       );
  //     } catch (error) {
  //       this.log(error);
  //     }
  //   }
  // );
  // this.ui.main.presetBox.presetListWidget.itemChanged.connect(
  //   this,
  //   function (item) {
  //     // una hora de investigacion, transforma la respuesta de check state (que es checked, not checked, partially checked) en un booleano)
  //     this.presets.edit(
  //       (presetName = item.text()),
  //       (renderEnabled = item.checkState() == Qt.Checked)
  //     );
  //   }
  // );

  // Timeline Set Start and End to Playhead, and reset Signals
  this.ui.main.timeline.startFrameSpinBox.setValue(scene.getStartFrame());
  this.ui.main.timeline.endFrameSpinBox.setValue(scene.getStopFrame());

  this.ui.main.timeline.startFrameSpinBox.valueChanged.connect(
    this,
    function (frameNumber) {
      scene.setStartFrame(frameNumber);
      this.ui.main.timeline.startFrameSpinBox.setRange(
        1,
        scene.getStopFrame() - 1
      );
      this.ui.main.timeline.endFrameSpinBox.setRange(
        scene.getStartFrame() + 1,
        frame.numberOf()
      );
    }
  );
  this.ui.main.timeline.endFrameSpinBox.valueChanged.connect(
    this,
    function (frameNumber) {
      scene.setStopFrame(frameNumber);
      this.ui.main.timeline.startFrameSpinBox.setRange(
        1,
        scene.getStopFrame() - 1
      );
      this.ui.main.timeline.endFrameSpinBox.setRange(
        scene.getStartFrame() + 1,
        frame.numberOf()
      );
    }
  );

  this.ui.main.timeline.resetStartEnd.clicked.connect(this, function () {
    this.ui.main.timeline.startFrameSpinBox.setValue(1);
    this.ui.main.timeline.endFrameSpinBox.setValue(frame.numberOf());
    scene.setStartFrame(1);
    scene.setStopFrame(frame.numberOf());
  });

  this.ui.main.timeline.setStartFrameButton.clicked.connect(this, function () {
    var currentFrame = frame.current();
    scene.setStartFrame(currentFrame);
    this.ui.main.timeline.startFrameSpinBox.setValue(currentFrame);
    this.ui.main.timeline.endFrameSpinBox.setValue(scene.getStopFrame());
    // Timeline.centerOnFrame(frame.current());
  });

  this.ui.main.timeline.setEndFrameButton.clicked.connect(this, function () {
    var currentFrame = frame.current();
    scene.setStopFrame(currentFrame);
    this.ui.main.timeline.endFrameSpinBox.setValue(currentFrame);
    this.ui.main.timeline.startFrameSpinBox.setValue(scene.getStartFrame());
    // Timeline.centerOnFrame(frame.current());
  });

  this.ui.main.buttonRender.clicked.connect(this, function () {
    this.interruptRender = false;
    this.renderSuccess = false;
    this.renderMode = "Advanced";
    this.ui.setCurrentWidget(this.ui.progress);
    this.ui.progress.renderProgress.openRendersFolder.setVisible(false);
    this.ui.progress.renderProgress.goBack.setVisible(false);
    this.ui.progress.renderProgress.progressBar.setVisible(true);
    this.ui.progress.renderProgress.cancelRenderButton.setVisible(true);
    this.ui.progress.renderProgress.cancelRenderButton.text = "Cancel";
    this.renderEngine.call(this);
    this.ui.progress.renderProgress.progressBar.setVisible(false);
    if (this.renderSuccess) {
      this.ui.progress.renderProgress.openRendersFolder.setVisible(true);
      this.ui.progress.renderProgress.cancelRenderButton.setVisible(false);
      this.beep.win.play();
      this.ui.progress.renderProgress.progressText.text =
        "✅ Render complete ✅";
      this.ui.progress.renderProgress.goBack.setVisible(true);
    } else {
      this.ui.progress.renderProgress.openRendersFolder.setVisible(true);
      this.ui.progress.renderProgress.cancelRenderButton.setVisible(false);
      this.beep.fail.play();
      this.ui.progress.renderProgress.progressText.text =
        "⛔ Render ended before completion ⛔";
      this.ui.progress.renderProgress.goBack.setVisible(true);
    }
  });

  // // Disable some buttons if no presets are selected
  // this.ui.main.presetBox.presetListWidget.itemSelectionChanged.connect(
  //   this,
  //   function () {
  //     var enablebuttons =
  //       this.ui.main.presetBox.presetListWidget.selectedItems() == ""
  //         ? false
  //         : true;
  //     // this.ui.main.presetBox.presetInfoBox.setVisible(enablebuttons);
  //     // this.ui.main.presetBox.buttonDeletePreset.setEnabled(enablebuttons);
  //     // this.ui.main.presetBox.buttonEditPreset.setEnabled(enablebuttons);
  //     // this.ui.main.presetBox.buttonDuplPreset.setEnabled(enablebuttons);
  //     this.ui.main.presetBox.presetInfoBox.presetNameInfoLabel.setVisible(
  //       enablebuttons
  //     );
  //     this.ui.main.presetBox.presetInfoBox.presetTagInfoLabel.setVisible(
  //       enablebuttons
  //     );
  //     this.ui.main.presetBox.presetInfoBox.presetResInfoLabel.setVisible(
  //       enablebuttons
  //     );
  //     this.ui.main.presetBox.presetInfoBox.presetInfoMov.setVisible(
  //       enablebuttons
  //     );
  //     this.ui.main.presetBox.presetInfoBox.presetInfoPNG.setVisible(
  //       enablebuttons
  //     );
  //   }
  // );
  // this.ui.main.presetBox.presetListWidget.itemSelectionChanged(); // Emit the signal on window creation so it checks if the buttons should be enabled

  // ////////////////////////// EDIT UI /////////////////////////////

  // this.ui.edit.messageDialog = new QMessageBox(this.ui.edit);

  // // ----------- Checking if fields are populated ----------- //
  // this.ui.edit.infoBox.presetName.textChanged.connect(this, checkFields);
  // this.ui.edit.infoBox.presetHResolution.currentTextChanged.connect(
  //   this,
  //   checkFields
  // );
  // this.ui.edit.infoBox.presetVResolution.currentTextChanged.connect(
  //   this,
  //   checkFields
  // );
  // this.ui.edit.formatsBox.isMOVVideoFile.stateChanged.connect(
  //   this,
  //   checkFields
  // );
  // this.ui.edit.formatsBox.isMP4VideoFile.stateChanged.connect(
  //   this,
  //   checkFields
  // );
  // this.ui.edit.formatsBox.isPNGSequence.stateChanged.connect(this, checkFields);
  // checkFields.call(this);

  // function checkFields() {
  //   this.ui.edit.saveButton.enabled =
  //     this.ui.edit.infoBox.presetName.text.length > 0 &&
  //     this.ui.edit.infoBox.presetHResolution.currentText.length > 0 &&
  //     this.ui.edit.infoBox.presetVResolution.currentText.length > 0 &&
  //     (this.ui.edit.formatsBox.isMOVVideoFile.checked ||
  //       this.ui.edit.formatsBox.isMP4VideoFile.checked ||
  //       this.ui.edit.formatsBox.isPNGSequence.checked);
  // }
  // // ----------- End Checking if fields are populated ----------- //

  // this.ui.edit.saveButton.clicked.connect(this, function () {
  //   var renderPresets = this.presets.data;
  //   try {
  //     if (this.editMode == "edit") {
  //       this.log("Editing a preset now...");
  //       if (this.ui.edit.infoBox.presetName.text != this.selectedPreset) {
  //         //
  //         // Check if new edited preset name is not equal to an stored one, to avoid overwriting it
  //         if (this.ui.edit.infoBox.presetName.text in renderPresets) {
  //           this.ui.edit.messageDialog.text =
  //             "A preset with the same name already exists";
  //           this.ui.edit.messageDialog.exec();
  //           return;
  //           // this.refreshPresetsAndDisplays();
  //         }

  //         this.presets.remove(this.selectedPreset);
  //         this.presets.add(
  //           (presetName = this.ui.edit.infoBox.presetName.text),
  //           (renderTag = this.ui.edit.infoBox.renderTag.currentText),
  //           (resX = this.ui.edit.infoBox.presetHResolution.currentText),
  //           (resY = this.ui.edit.infoBox.presetVResolution.currentText),
  //           (mov = this.ui.edit.formatsBox.isMOVVideoFile.checked),
  //           (mp4 = this.ui.edit.formatsBox.isMP4VideoFile.checked),
  //           (pngseq = this.ui.edit.formatsBox.isPNGSequence.checked)
  //         );
  //       } else {
  //         // this.presets.remove(this.selectedPreset);
  //         this.presets.edit(
  //           (presetName = this.ui.edit.infoBox.presetName.text),
  //           (renderEnabled = renderPresets[this.selectedPreset].render_enabled),
  //           (renderTag = this.ui.edit.infoBox.renderTag.currentText),
  //           (resX = this.ui.edit.infoBox.presetHResolution.currentText),
  //           (resY = this.ui.edit.infoBox.presetVResolution.currentText),
  //           (mov = this.ui.edit.formatsBox.isMOVVideoFile.checked),
  //           (mp4 = this.ui.edit.formatsBox.isMP4VideoFile.checked),
  //           (pngseq = this.ui.edit.formatsBox.isPNGSequence.checked)
  //         );
  //       }
  //     }
  //     if (this.editMode == "add" || this.editMode == "duplicate") {
  //       if (this.ui.edit.infoBox.presetName.text in renderPresets) {
  //         this.ui.edit.messageDialog.text =
  //           "A preset with the same name already exists";
  //         this.ui.edit.messageDialog.exec();
  //         return;
  //         // this.refreshPresetsAndDisplays();
  //       }
  //       this.presets.add(
  //         this.ui.edit.infoBox.presetName.text,
  //         this.ui.edit.infoBox.renderTag.currentText,
  //         this.ui.edit.infoBox.presetHResolution.currentText,
  //         this.ui.edit.infoBox.presetVResolution.currentText,
  //         this.ui.edit.formatsBox.isMOVVideoFile.checked,
  //         this.ui.edit.formatsBox.isMP4VideoFile.checked,
  //         this.ui.edit.formatsBox.isPNGSequence.checked
  //       );
  //     }

  //     this.refreshPresetsAndDisplays();
  //     this.ui.setCurrentWidget(this.ui.main);
  //   } catch (error) {
  //     this.log(error);
  //   }
  // });

  // this.ui.edit.cancelButton.clicked.connect(this, function () {
  //   this.ui.setCurrentWidget(this.ui.main);
  // });

  //////////////////// PROGRESS UI /////////////////////////
  // this.ui.progress.renderProgress.cancelRenderButton.setVisible(false);
  this.ui.progress.renderProgress.cancelRenderButton.clicked.connect(
    this,
    function () {
      try {
        this.interruptRender = true;
        this.ui.progress.renderProgress.cancelRenderButton.text =
          "Waiting for this render to finish...";
        // render.cancelRender();
        // this.renderFinished();
        // render.frameReady.disconnect(this, this.frameReady);
        // this.log("Deleting >> " + outputPath);
        // new QDir(outputPath).removeRecursively();
      } catch (error) {
        this.log(error);
      }
    }
  );

  this.ui.progress.renderProgress.openRendersFolder.clicked.connect(
    this,
    function () {
      this.ui.setCurrentWidget(this.ui.main);
      this.openFolder.call(this, this.outputFolder);
    }
  );

  this.ui.progress.renderProgress.goBack.clicked.connect(this, function () {
    this.ui.setCurrentWidget(this.ui.main);
  });

  //////////// Presets Table Setup ///////////////////
  // this.ui.main.presetBox.presetListWidget.setVisible(false);
  this.ui.main.presetBox.presetsTable.itemChanged.connect(
    this,
    function (item) {
      try {
        this.ui.main.presetBox.presetsTable.blockSignals(true);

        var obj = this.presets.data;
        var currentItem = {
          row: item.row(),
          column: item.column(),
          checkState: item.checkState(),
          itemText: item.text(),
          // presetName: this.ui.main.presetBox.presetsTable
          //   .item(item.row(), 1)
          //   .text(),
        };

        // Store Render Enabled Checkbox
        if (currentItem.column === 0) {
          obj[currentItem.row + 1]["render_enabled"] =
            currentItem.checkState === Qt.Checked;
        }

        // Store Render Name
        if (currentItem.column === 1) {
          obj[currentItem.row + 1]["preset_name"] = currentItem.itemText;
        }

        // Store Aspect Ratio
        // Todo regular expresion check for unlocked and num:num format
        if (currentItem.column === 2) {
          obj[currentItem.row + 1]["aspect_ratio"] = currentItem.itemText;
          if (obj[currentItem.row + 1]["aspect_ratio"] !== "Unlocked") {
            var aspectRatio = currentItem.itemText.split(":");
            obj[currentItem.row + 1]["resolution_y"] = String(
              Math.round(
                (obj[currentItem.row + 1]["resolution_x"] * aspectRatio[1]) /
                  aspectRatio[0]
              )
            );
            this.ui.main.presetBox.presetsTable
              .item(currentItem.row, 4)
              .setText(obj[currentItem.row + 1]["resolution_y"]);
            this.ui.main.presetBox.presetsTable;
          }
        }

        // Store Resolution Width
        if (currentItem.column === 3) {
          if (obj[currentItem.row + 1]["aspect_ratio"] !== "Unlocked") {
            var aspectRatio =
              obj[currentItem.row + 1]["aspect_ratio"].split(":");
            obj[currentItem.row + 1]["resolution_x"] = currentItem.itemText;
            obj[currentItem.row + 1]["resolution_y"] = String(
              Math.round(
                (currentItem.itemText * aspectRatio[1]) / aspectRatio[0]
              )
            );
            this.ui.main.presetBox.presetsTable
              .item(currentItem.row, 4)
              .setText(obj[currentItem.row + 1]["resolution_y"]);
          } else {
            obj[currentItem.row + 1]["resolution_x"] = currentItem.itemText;
          }
        }

        // Store Resolution Height
        if (currentItem.column === 4) {
          if (obj[currentItem.row + 1]["aspect_ratio"] !== "Unlocked") {
            var aspectRatio =
              obj[currentItem.row + 1]["aspect_ratio"].split(":");
            obj[currentItem.row + 1]["resolution_y"] = currentItem.itemText;
            obj[currentItem.row + 1]["resolution_x"] = String(
              Math.round(
                (currentItem.itemText * aspectRatio[0]) / aspectRatio[1]
              )
            );
            this.ui.main.presetBox.presetsTable
              .item(currentItem.row, 3)
              .setText(obj[currentItem.row + 1]["resolution_x"]);
          } else {
            obj[currentItem.row + 1]["resolution_y"] = currentItem.itemText;
          }
        }

        // Store Selected Formats
        if (currentItem.column === 5) {
          var editedFormats = currentItem.itemText.split(", ");

          for (var supportedFormat in this.supportedFormats) {
            obj[currentItem.row + 1]["render_formats"][supportedFormat] =
              editedFormats.indexOf(supportedFormat) > -1;
          }
        }

        // Store Filename Format
        if (currentItem.column === 6) {
          obj[currentItem.row + 1]["filename_format"] = currentItem.itemText;
        }

        // Write presets data
        this.presets.data = obj;

        // Hacky method to force last header section to stretch to the end. setStretchLastSection doesnt work on tbh
        for (
          var i = 0;
          i < this.ui.main.presetBox.presetsTable.columnCount - 1;
          i++
        ) {
          this.ui.main.presetBox.presetsTable.resizeColumnToContents(i);
        }

        // Release signal blocking
        this.ui.main.presetBox.presetsTable.blockSignals(false);
      } catch (error) {
        MessageBox.information(error);
      }
    }
  );
  //////////// Presets Table Setup ///////////////////
  this.ui.main.displayBox.displaysTable.itemChanged.connect(
    this,
    function (item) {
      try {
        this.ui.main.displayBox.displaysTable.blockSignals(true);

        var currentDisplayNodes = this.getselectedDisplayNodes();

        var currentItem = {
          row: item.row(),
          column: item.column(),
          checkState: item.checkState(),
          itemText: item.text(),
          // presetName: this.ui.main.presetBox.presetsTable
          //   .item(item.row(), 1)
          //   .text(),
        };
        // Change Display Enabled
        if (currentItem.column === 0) {
          node.setEnable(
            currentDisplayNodes[currentItem.row],
            currentItem.checkState === Qt.Checked
          );
        }
        // Change Display Node Name
        if (currentItem.column === 1) {
          if (
            !node.rename(
              currentDisplayNodes[currentItem.row],
              currentItem.itemText.split(" ").join("_")
            )
          ) {
            this.ui.main.displayBox.displaysTable
              .item(currentItem.row, 1)
              .setText(node.getName(currentDisplayNodes[currentItem.row]));
          } else {
            this.ui.main.displayBox.displaysTable
              .item(currentItem.row, 1)
              .setText(currentItem.itemText.split(" ").join("_"));
          }
        }

        // Hacky method to force last header section to stretch to the end. setStretchLastSection doesnt work on tbh
        for (
          var i = 0;
          i < this.ui.main.displayBox.displaysTable.columnCount - 1;
          i++
        ) {
          this.ui.main.displayBox.displaysTable.resizeColumnToContents(i);
        }
        // Release signal blocking
        this.ui.main.displayBox.displaysTable.blockSignals(false);
      } catch (error) {
        MessageBox.information(error);
      }
    }
  );

  //////////// Filename Editor Setup ///////////////////
  var filenameOptions = {
    1: { label: "Scene Name", value: "#SceneName#" },
    2: { label: "Scene Version", value: "#SceneVersion#" },
    3: { label: "Scene Version Name", value: "#SceneVersionName#" },
    4: { label: "Preset Name", value: "#PresetName#" },
    5: { label: "Resolution", value: "#Resolution#" },
    6: { label: "Render Format", value: "#RenderFormat#" },
    7: { label: "Display Node", value: "#DisplayNode#" },
    8: { label: "Date-Time", value: "#DateTime#" },
    9: { label: "Date", value: "#Date#" },
    10: { label: "Time", value: "#Time#" },
    11: { label: "Year", value: "#Year#" },
    12: { label: "Month", value: "#Month#" },
    13: { label: "Day", value: "#Day#" },
    14: { label: "Hour", value: "#Hour#" },
    15: { label: "Minute", value: "#Minute#" },
    16: { label: "Second", value: "#Second#" },
  };

  for (var key in filenameOptions) {
    var option = filenameOptions[key];
    var row = Math.floor((key - 1) / 4);
    var col = (key - 1) % 4;

    var button = new QPushButton(option.label);
    var tabsWidget = this.ui.filenameEditor.presetOutputNameEditor;

    button.clicked.connect(
      (function (value) {
        try {
          return function () {
            try {
              var currentTab = tabsWidget.currentWidget();

              var field =
                currentTab["outputNameField"] ||
                currentTab["outputSeqNameField"];
              if (field) {
                field.insert(value);
              }
            } catch (error) {
              MessageLog.trace(error);
            }
          };
        } catch (error) {
          MessageLog.trace(error);
        }
      })(option.value, tabsWidget)
    );

    this.ui.filenameEditor.filenameTags.layout().addWidget(button, row, col);
  }
  var outputNameProcessor = function (newText, presetToEdit) {
    var outputName = newText;

    outputName = outputName.replace(/#SceneName#/g, scene.currentScene());
    outputName = outputName.replace(
      /#SceneVersion#/g,
      "v" + scene.currentVersion()
    );
    outputName = outputName.replace(
      /#SceneVersionName#/g,
      scene.currentVersionName()
    );
    outputName = outputName.replace(/#PresetName#/g, presetToEdit.preset_name);
    outputName = outputName.replace(
      /#Resolution#/g,
      "[" + presetToEdit.resolution_x + "x" + presetToEdit.resolution_y + "]"
    );
    outputName = outputName.replace(/#RenderFormat#/g, "Video-Format");
    var displayPath = scene.getDefaultDisplay().split("/").pop();
    outputName = outputName.replace(/#DisplayNode#/g, displayPath);
    outputName = outputName.replace(/#DateTime#/g, this.now().dateTime);
    outputName = outputName.replace(/#Date#/g, this.now().date);
    outputName = outputName.replace(/#Time#/g, this.now().time);
    outputName = outputName.replace(/#Year#/g, this.now().year);
    outputName = outputName.replace(/#Month#/g, this.now().month);
    outputName = outputName.replace(/#Day#/g, this.now().day);
    outputName = outputName.replace(/#Hour#/g, this.now().hour);
    outputName = outputName.replace(/#Minute#/g, this.now().minute);
    outputName = outputName.replace(/#Second#/g, this.now().second);

    return outputName;
  };

  this.ui.filenameEditor.presetOutputNameEditor.qt_tabwidget_stackedwidget.videofile.outputNameField.textChanged.connect(
    this,
    function (newText) {
      this.ui.filenameEditor.outputName.outputNameExample.setText(
        outputNameProcessor.call(this, newText, this.presetToEdit) + ".mov"
      );
    }
  );

  this.ui.filenameEditor.presetOutputNameEditor.qt_tabwidget_stackedwidget.imgseq.outputSeqNameField.textChanged.connect(
    this,
    function (newText) {
      this.ui.filenameEditor.outputName.outputSeqNameExample.setText(
        outputNameProcessor.call(this, newText, this.presetToEdit) + "_####.png"
      );
    }
  );

  this.ui.filenameEditor.filenameGoBack.clicked.connect(this, function () {
    this.ui.setCurrentWidget(this.ui.main);
  });

  this.ui.filenameEditor.filenameSave.clicked.connect(this, function () {
    try {
      var obj = this.presets.data;
      for (var key in this.presetToEdit) {
        obj[key].output_name_format =
          this.ui.filenameEditor.presetOutputNameEditor.qt_tabwidget_stackedwidget.videofile.outputNameField.text;
        obj[key].output_fileseq_format =
          this.ui.filenameEditor.presetOutputNameEditor.qt_tabwidget_stackedwidget.imgseq.outputSeqNameField.text;
      }
      this.presets.data = obj;

      this.refreshPresetsAndDisplays();
      this.ui.setCurrentWidget(this.ui.main);
    } catch (error) {
      MessageLog.trace(error);
    }
  });

  this.ui.main.quickOptions.openRenderFolder.clicked.connect(this, function () {
    this.openFolder.call(this, this.outputFolder);
  });

  this.ui.main.quickOptions.renderCurrentFrame.clicked.connect(
    this,
    function () {
      try {
        // var startFrame = scene.getStartFrame();
        // var stopFrame = scene.getStopFrame();
        // scene.setStartFrame(frame.current());
        // scene.setStopFrame(frame.current());
        Timeline.centerOnFrame(frame.current());

        this.interruptRender = false;
        this.renderSuccess = false;
        // this.renderMode = "Advanced";
        this.ui.setCurrentWidget(this.ui.progress);
        this.ui.progress.renderProgress.openRendersFolder.setVisible(false);
        this.ui.progress.renderProgress.goBack.setVisible(false);
        this.ui.progress.renderProgress.progressBar.setVisible(true);
        this.ui.progress.renderProgress.progressBar.setRange(0, 0);
        this.ui.progress.renderProgress.cancelRenderButton.setVisible(false);
        this.ui.progress.renderProgress.cancelRenderButton.text = "Cancel";
        try {
          // this.pngRenderer.call(
          //   this,
          //   this.versionedPath(
          //     this.outputFolder + "/" + scene.currentScene() + "-"
          //   ),
          //   scene.currentResolutionX(),
          //   scene.currentResolutionY(),
          //   scene.getDefaultDisplay(),
          //   this.ui.progress.renderProgress
          // );

          this.frameReady = function (frame, celImage) {
            var outFrame = this.versionedPath(
              this.outputFolder +
                "/" +
                scene.currentScene() +
                "-" +
                ("000000" + frame).slice(-6) +
                ".png"
            );
            celImage.imageFileAs(outFrame, "", "PNG4");
            // renderedFrames.push(outFrame);
            QCoreApplication.processEvents();
          };

          this.renderFinished = function () {
            render.renderFinished.disconnect(this, this.renderFinished);
            render.frameReady.disconnect(this, this.frameReady);
            this.renderSuccess = true;
            QCoreApplication.processEvents();
          };

          render.renderFinished.connect(this, this.renderFinished);
          render.setResolution(
            scene.currentResolutionX(),
            scene.currentResolutionY()
          );
          render.frameReady.connect(this, this.frameReady);
          render.setRenderDisplay(scene.getDefaultDisplay());

          render.renderScene(frame.current(), frame.current());
        } catch (error) {
          this.renderSuccess = false;
          MessageLog.trace(error);
        }
        this.ui.progress.renderProgress.progressBar.setVisible(false);
        if (this.renderSuccess) {
          this.ui.progress.renderProgress.openRendersFolder.setVisible(true);
          this.ui.progress.renderProgress.cancelRenderButton.setVisible(false);
          this.beep.win.play();
          this.ui.progress.renderProgress.progressText.text =
            "✅ Render complete ✅";
          this.ui.progress.renderProgress.goBack.setVisible(true);
        } else {
          this.ui.progress.renderProgress.openRendersFolder.setVisible(true);
          this.ui.progress.renderProgress.cancelRenderButton.setVisible(false);
          this.beep.fail.play();
          this.ui.progress.renderProgress.progressText.text =
            "⛔ Render ended before completion ⛔";
          this.ui.progress.renderProgress.goBack.setVisible(true);
        }
      } catch (error) {
        MessageLog.trace(error);
      }
    }
  );
};

EzRender.prototype.showAdvancedUI = function () {
  try {
    // this.refreshUIDisplayNodes();
    this.ui.setCurrentWidget(this.ui.main);
    this.refreshPresetsAndDisplays.call(this);
    this.ui.show();
    this.ui.minimumWidth = UiLoader.dpiScale(800);
    this.ui.minimumHeight = UiLoader.dpiScale(700);
    this.ui.maximumWidth = UiLoader.dpiScale(800);
    this.ui.maximumHeight = UiLoader.dpiScale(700);
    this.ui.adjustSize();
    this.ui.activateWindow(); // Set current window to the top
    // this.ui.update();
  } catch (error) {
    this.log(error);
  }
};

// EzRender.prototype.presetEditUI = function () {
//   if (typeof this.selectedPreset === "undefined") this.selectedPreset = "";

//   try {
//     this.log("Mode is : " + this.editMode);

//     // Reset the User Interface & Disconnect signals
//     this.ui.edit.infoBox.presetName.clear();
//     this.ui.edit.infoBox.renderTag.clearEditText();
//     this.ui.edit.infoBox.presetHResolution.clearEditText();
//     this.ui.edit.infoBox.presetVResolution.clearEditText();
//     this.ui.edit.formatsBox.isMOVVideoFile.setChecked(false);
//     this.ui.edit.formatsBox.isMP4VideoFile.setChecked(false);
//     this.ui.edit.formatsBox.isPNGSequence.setChecked(false);

//     var renderPresets = this.presets.data;

//     if (this.editMode == "edit" || this.editMode == "duplicate") {
//       if (this.editMode == "edit") {
//         this.ui.edit.infoBox.presetName.setText(this.selectedPreset);
//         // this.ui.edit.infoBox.presetName.enabled = false; // Disable preset name editing
//       }
//       if (this.editMode == "duplicate")
//         this.ui.edit.infoBox.presetName.setText(this.selectedPreset + " Copy");
//       this.ui.edit.infoBox.renderTag.setCurrentText(
//         renderPresets[this.selectedPreset].render_tag
//       );
//       this.ui.edit.infoBox.presetHResolution.setCurrentText(
//         renderPresets[this.selectedPreset].resolution_x
//       );
//       this.ui.edit.infoBox.presetVResolution.setCurrentText(
//         renderPresets[this.selectedPreset].resolution_y
//       );
//       this.ui.edit.formatsBox.isMOVVideoFile.setChecked(
//         renderPresets[this.selectedPreset].render_formats.mov
//       );
//       this.ui.edit.formatsBox.isMP4VideoFile.setChecked(
//         renderPresets[this.selectedPreset].render_formats.mp4
//       );
//       this.ui.edit.formatsBox.isPNGSequence.setChecked(
//         renderPresets[this.selectedPreset].render_formats.pngseq
//       );
//     }

//     this.ui.setCurrentWidget(this.ui.edit);
//   } catch (error) {
//     this.log(error);
//   }
// };

// EzRender.prototype.refreshUIDisplayNodes = function () {
//   // this.ui.main.displayBox.displaySelector.clear();
//   // this.ui.main.displayBox.displaySelector.addItems(this.getselectedDisplayNodes());
//   this.refreshPresetsAndDisplays.call(this);
// };

EzRender.prototype.refreshPresetsAndDisplays = function () {
  // MessageLog.trace("Refreshing tables");

  var currentPresets = this.presets.data;

  /////////////////////////////////// DISPLAYS TABLE STUFF ///////////////////////////////////
  this.ui.main.displayBox.displaysTable.blockSignals(true);

  this.ui.main.displayBox.displaysTable.clearContents(); // Clear advanced ui preset list

  var currentDisplayNodes = this.getselectedDisplayNodes();

  this.ui.main.displayBox.displaysTable.rowCount =
    Object.keys(currentDisplayNodes).length; // QTableWidget requires rowCount to be set manually

  for (var displayNode in currentDisplayNodes) {
    // Set the Row Height for each element
    // this.ui.main.displayBox.displaysTable.setRowHeight(
    //   displayNode,
    //   UiLoader.dpiScale(25)
    // );

    //////// DISPLAY ENABLED CHECKBOX
    this.ui.main.displayBox.displaysTable.setItem(
      displayNode,
      0,
      new QTableWidgetItem()
    );
    this.ui.main.displayBox.displaysTable
      .item(displayNode, 0)
      .setCheckState(
        node.getEnable(currentDisplayNodes[displayNode]) == true ? 2 : 0
      );

    //////// DISPLAY NAME
    this.ui.main.displayBox.displaysTable.setItem(
      displayNode,
      1,
      new QTableWidgetItem(node.getName(currentDisplayNodes[displayNode]))
    );

    //////// DISPLAY PLUGGED IN
    // var displayPath = displayPath.join("/");
    var displayPluggedItem = new QTableWidgetItem(
      node.isLinked(currentDisplayNodes[displayNode], 0) ? "✓" : "✕"
    );
    displayPluggedItem.setTextAlignment(Qt.AlignCenter);
    this.ui.main.displayBox.displaysTable.setItem(
      displayNode,
      2,
      displayPluggedItem
    );

    //////// DISPLAY PATH
    var displayPath = currentDisplayNodes[displayNode].split("/");
    displayPath.pop();
    var displayPath = displayPath.join("/");
    this.ui.main.displayBox.displaysTable.setItem(
      displayNode,
      3,
      new QTableWidgetItem(displayPath)
    );
  }

  for (
    var i = 0;
    i < this.ui.main.displayBox.displaysTable.columnCount - 1;
    i++
  ) {
    this.ui.main.displayBox.displaysTable.resizeColumnToContents(i);
  }

  this.ui.main.displayBox.displaysTable.blockSignals(false);

  /////////////////////////////////// TIMELINE STUFF ///////////////////////////////////
  // TODO Marker Method

  /////////////////////////////////// PRESETS TABLE STUFF ///////////////////////////////////
  this.ui.main.presetBox.presetsTable.blockSignals(true); // Block signals to avoid recursivity

  this.ui.main.presetBox.presetsTable.clearContents(); // Clear advanced ui preset list

  this.ui.main.presetBox.presetsTable.rowCount =
    Object.keys(currentPresets).length; // QTableWidget requires rowCount to be set manually

  // Update QTableWidget filling it with the presets
  // for (var i = 0; i < Object.keys(currentPresets).length; i++) {
  // var currentTableIndex = 0;
  for (var preset in currentPresets) {
    var currentTableIndex = preset - 1;

    // Set the Row Height for each element
    // this.ui.main.presetBox.presetsTable.setRowHeight(
    //   currentTableIndex,
    //   UiLoader.dpiScale(25)
    // );

    //////// PRESET ENABLED
    this.ui.main.presetBox.presetsTable.setItem(
      currentTableIndex,
      0,
      new QTableWidgetItem()
    );

    this.ui.main.presetBox.presetsTable
      .item(currentTableIndex, 0)
      .setCheckState(
        currentPresets[preset].render_enabled == true
          ? Qt.Checked
          : Qt.Unchecked
      );

    //////// PRESET NAME
    this.ui.main.presetBox.presetsTable.setItem(
      currentTableIndex,
      1,
      new QTableWidgetItem(currentPresets[preset]["preset_name"])
    );

    //////// ASPECT RATIO
    function comboSuggestDelegate(itemsList) {
      var suggester = new QStyledItemDelegate();
      suggester.createEditor = function (parent, option, index) {
        try {
          var editor = new QComboBox(parent);
          for (var i in itemsList) {
            editor.addItem(itemsList[i]);
          }
          return editor;
        } catch (error) {
          MessageLog.trace(error);
        }
      };
      return suggester;
    }
    this.ui.main.presetBox.presetsTable.setItemDelegateForColumn(
      2,
      comboSuggestDelegate([
        "Unlocked",
        "16:9",
        "9:16",
        "4:3",
        "1:1",
        "3:2",
        "2.35:1",
        "2.39:1",
        "2.4:1",
        "2.2:1",
        "2.76:1",
        "6:13",
        "5:4",
        "1.43:1",
        "16:10",
      ])
    );
    this.ui.main.presetBox.presetsTable.setItem(
      currentTableIndex,
      2,
      new QTableWidgetItem(currentPresets[preset]["aspect_ratio"])
    );

    //////// RESOLUTION
    var suggestedResolutions = {
      height: ["8192", "4096", "3840", "2048", "1920", "1280", "720", "540"],
      width: [
        "4320",
        "4096",
        "2160",
        "2048",
        "1080",
        "1024",
        "720",
        "576",
        "540",
        "480",
      ],
    };

    function suggestDelegate(completerList) {
      var suggester = new QStyledItemDelegate();
      suggester.createEditor = function (parent, option, index) {
        try {
          var editor = new QLineEdit(parent);
          var completer = new QCompleter(completerList, this);
          validator = new QIntValidator();
          editor.setValidator(validator);
          editor.setCompleter(completer);
          return editor;
        } catch (error) {
          MessageLog.trace(error);
        }
      };
      return suggester;
    }

    this.ui.main.presetBox.presetsTable.setItemDelegateForColumn(
      3,
      suggestDelegate(suggestedResolutions.height)
    );
    // Add Preset Height Resolution (pure text)
    this.ui.main.presetBox.presetsTable.setItem(
      currentTableIndex,
      3,
      new QTableWidgetItem(currentPresets[preset]["resolution_x"])
    );
    this.ui.main.presetBox.presetsTable.setItemDelegateForColumn(
      4,
      suggestDelegate(suggestedResolutions.width)
    );
    // Add Preset Width Resolution
    this.ui.main.presetBox.presetsTable.setItem(
      currentTableIndex,
      4,
      new QTableWidgetItem(currentPresets[preset]["resolution_y"])
    );

    //////// FORMAT
    var formatList = [];
    for (var format in currentPresets[preset]["render_formats"])
      if (currentPresets[preset]["render_formats"][format])
        formatList.push(format);

    function formatsDelegate(list) {
      var suggester = new QStyledItemDelegate();
      suggester.createEditor = function (parent, option, index) {
        try {
          var enabledFormats = index.data(Qt.DisplayRole).split(", ");
          var tool_button = new QToolButton(parent);
          tool_button.text = index.data(Qt.DisplayRole);

          var menu = new QMenu(parent);
          for (var stuff in list) {
            MessageLog.trace(stuff);
            // Add actions and make them checkable
            var action = menu.addAction(stuff);
            action.checkable = true;
            action.checked = enabledFormats.indexOf(stuff) > -1;
          }

          // Connect 'triggered' signal to a function that updates the text of the tool_button
          menu.triggered.connect(this, function (action) {
            MessageLog.trace("menu triggered");
            var text = "";
            var actions = menu.actions();
            for (var i = 0; i < actions.length; i++) {
              if (actions[i].checked) {
                if (text != "") text += ", ";
                text += actions[i].text;
              }
            }
            tool_button.text = text;
          });

          tool_button.setMenu(menu);
          tool_button.popupMode = QToolButton.InstantPopup;

          // Use QTimer to delay showing the popup until after the combo box is shown
          var timer = new QTimer();
          timer.singleShot = true;
          timer.timeout.connect(function () {
            tool_button.showMenu();
          });
          timer.start(0); // Start the timer with 0 ms delay

          // tool_button.showMenu();
          return tool_button;
        } catch (error) {
          MessageLog.trace(error);
        }
      };
      suggester.setEditorData = function (editor, index) {
        var text = "";
        var menu = editor.menu();
        var actions = menu.actions();
        for (var i = 0; i < actions.length; i++) {
          if (actions[i].checked) {
            if (text != "") text += ", ";
            text += actions[i].text;
          }
        }
        index.model().setData(index, text, Qt.EditRole);
      };
      return suggester;
    }

    this.ui.main.presetBox.presetsTable.setItemDelegateForColumn(
      5,
      formatsDelegate(this.supportedFormats)
    );
    // Add Preset Formats
    this.ui.main.presetBox.presetsTable.setItem(
      currentTableIndex,
      5,
      new QTableWidgetItem(formatList.join(", "))
    );

    //////// FILENAME FORMAT
    try {
      var filenameEditButton = new QPushButton(
        currentPresets[preset]["output_name_format"] +
          " " +
          currentPresets[preset]["output_fileseq_format"]
      );
      // filenameEditButton.clicked.connect(this, function () {
      //   try {
      //     this.ui.setCurrentWidget(this.ui.filenameEditor);
      //     this.presetToEdit = currentPresets[preset];
      //     MessageLog.trace(JSON.stringify(this.presetToEdit));
      //     // this.ui.filenameEditor.presetData.filenameField.setText("");
      //   } catch (error) {
      //     MessageLog.trace(error);
      //   }
      // });
      // MessageLog.trace(JSON.stringify(currentPresets[preset]));
      filenameEditButton.clicked.connect(
        this,
        (function (presetName, presetContent) {
          return function () {
            try {
              this.presetToEdit = {};
              this.presetToEdit[presetName] = presetContent; // The preset to edit is the one that was clicked
              // MessageLog.trace("VALUE> " + JSON.stringify(this.presetToEdit));
              // this.ui.filenameEditor.presetOutputNameEditor.title =
              //   'Output Name Format for "' + value.preset_name + '"';
              this.ui.filenameEditor.presetOutputNameEditor.qt_tabwidget_stackedwidget.videofile.outputNameField.setText(
                presetContent.output_name_format
              );
              this.ui.filenameEditor.presetOutputNameEditor.qt_tabwidget_stackedwidget.imgseq.outputSeqNameField.setText(
                presetContent.output_fileseq_format
              );
              this.ui.filenameEditor.presetOutputNameEditor.currentIndex = 0;
              this.ui.setCurrentWidget(this.ui.filenameEditor);
            } catch (error) {
              MessageLog.trace(error);
            }
          };
        })(preset, currentPresets[preset])
      );

      this.ui.main.presetBox.presetsTable.setCellWidget(
        currentTableIndex,
        6,
        filenameEditButton
      );
    } catch (error) {
      MessageLog.trace(error);
    }
    //   //////// FILENAME FORMAT OLD
    //   function tagDelegate(tagsList) {
    //     var delegate = new QStyledItemDelegate();

    //     delegate.createEditor = function (parent, option, index) {
    //       try {
    //         var editor = new QWidget(parent);
    //         var layout = new QHBoxLayout(editor);
    //         var lineEdit = new QLineEdit(parent);
    //         var comboBox = new QComboBox(parent);

    //         comboBox.addItems(tagsList);
    //         comboBox.activated.connect(function (index) {
    //           var tag = comboBox.itemText(index);
    //           lineEdit.text += tag;
    //         });

    //         layout.addWidget(lineEdit, 1, 1); // Layout will give more space to the editor
    //         layout.addWidget(comboBox, 0, 1); // Assign a lower stretch factor to comboBox

    //         editor.minimumWidth = 200;
    //         layout.setContentsMargins(0, 0, 0, 0);
    //         layout.setSpacing(0);

    //         editor.setLayout(layout);

    //         return editor;
    //       } catch (error) {
    //         MessageLog.trace(error);
    //       }
    //     };
    //     delegate.setEditorData = function (editorWidget, index) {
    //       var value = index.model().data(index, Qt.EditRole);
    //       var editor = editorWidget.layout().itemAt(0).widget();
    //       editor.text = value;
    //     };
    //     delegate.setModelData = function (editorWidget, model, index) {
    //       var editor = editorWidget.layout().itemAt(0).widget();
    //       model.setData(index, editor.text, Qt.EditRole);
    //     };
    //     return delegate;
    //   }

    //   this.ui.main.presetBox.presetsTable.setItemDelegateForColumn(
    //     6,
    //     tagDelegate([
    //       "#SceneName#",
    //       "#SceneVersion#",
    //       "#SceneVersionName#",
    //       "#PresetName#",
    //       "#Resolution#",
    //       "#RenderFormat#",
    //       "#DisplayNode#",
    //       "#DateTime#",
    //       "#Date#",
    //       "#Time#",
    //       "#Year#",
    //       "#Month#",
    //       "#Day#",
    //       "#Hour#",
    //       "#Minute#",
    //       "#Second#",
    //     ])
    //   );

    //   this.ui.main.presetBox.presetsTable.setItem(
    //     currentTableIndex,
    //     6,
    //     new QTableWidgetItem(currentPresets[preset]["filename_format"])
    //   );
    //   // currentTableIndex++;
  }

  // Hacky method to force last header section to stretch to the end. setStretchLastSection doesnt work on tbh
  for (
    var i = 0;
    i < this.ui.main.presetBox.presetsTable.columnCount - 1;
    i++
  ) {
    this.ui.main.presetBox.presetsTable.resizeColumnToContents(i);
  }

  this.ui.main.presetBox.presetsTable.blockSignals(false);
  /////// END PRESETS TABLE STUFF ///////
};

// // Toolbar user interface functions
// EzRender.prototype.hookToolbar = function () {
//   this.hook = new (require(this.packageInfo.packageFolder +
//     "/lib/ToolbarHook/toolbarhook.js").ToolbarHook)(
//     this.packageInfo,
//     this.setupToolbarUI(),
//     true,
//     this.debug
//   );
// };

// EzRender.prototype.setupToolbarUI = function () {
//   this.toolbarui = UiLoader.load(
//     this.packageInfo.packageFolder + "/toolbar.ui"
//   );

//   this.toolbarui.setAttribute(Qt.WA_DeleteOnClose);

//   this.toolbarui.progressBar.setVisible(false);

//   this.toolbarui.setStartFrameButton.clicked.connect(this, function () {
//     scene.setStartFrame(frame.current());
//     // Timeline.centerOnFrame(frame.current());
//   });
//   this.toolbarui.setEndFrameButton.clicked.connect(this, function () {
//     scene.setStopFrame(frame.current());
//     // Timeline.centerOnFrame(frame.current());
//   });

//   this.toolbarui.quickRenderButton.clicked.connect(this, function () {
//     this.toolbarui.setStartFrameButton.setVisible(false);
//     this.toolbarui.setEndFrameButton.setVisible(false);
//     this.toolbarui.quickRenderButton.setVisible(false);
//     this.toolbarui.progressBar.setVisible(true);
//     this.renderMode = "Simple";
//     this.selectedPreset = this.toolbarui.presetList.currentText;
//     this.renderEngine.call(this);
//     this.toolbarui.progressBar.setVisible(false);
//     this.toolbarui.setStartFrameButton.setVisible(true);
//     this.toolbarui.setEndFrameButton.setVisible(true);
//     this.toolbarui.quickRenderButton.setVisible(true);
//   });

//   this.toolbarui.advancedButton.clicked.connect(this, function () {
//     this.showAdvancedUI();
//   });

//   this.toolbarui.advancedButton.icon = new QIcon(
//     this.packageInfo.packageFolder + "/icons/EZRender.png"
//   );

//   // this.toolbarui.presetList.setStyleSheet(
//   //     "border-radius: 5px;"
//   //     //#comboBox{border: 1px solid #ced4da;border-radius: 4px;padding-left: 10px;}#comboBox::on{border: 4px solid #c2dbfe;}#comboBox::QListView {font-size: 12px; border: 1px solid rgba(0, 0, 0, 10#);padding: 5px; background-color: #fff;outline: 0px;}
//   // );
//   this.toolbarui.setStartFrameButton.setStyleSheet(
//     "color: white; border-radius: 5px;"
//   );
//   this.toolbarui.setEndFrameButton.setStyleSheet(
//     "color: white; border-radius: 5px;"
//   );
//   this.toolbarui.quickRenderButton.setStyleSheet(
//     "color: white; border-radius: 5px;"
//   );
//   this.toolbarui.advancedButton.setStyleSheet(
//     "color: white; border-radius: 5px;"
//   );

//   return this.toolbarui;
// };

// Rendering functions
EzRender.prototype.renderEngine = function () {
  try {
    this.createFolder(this.outputFolder); // Create output folder in case that it had disappeared misteriously

    var renderPresets = this.presets.data;
    var enabledDisplays = {};
    var enabledPresets = {};
    var progressWidget;

    // Simple mode renders a single preset selected from the toolbar ui and the
    if (this.renderMode == "Simple") {
      // progressWidget = this.toolbarui;
      enabledDisplays.push(scene.getDefaultDisplay());
      enabledPresets.push(this.selectedPreset);
    }
    // Advanced mode renders all enabled presets and the display node selected from the advanced ui
    else if (this.renderMode == "Advanced") {
      progressWidget = this.ui.progress.renderProgress;

      var displayNodes = this.getselectedDisplayNodes();
      var index = 0;
      for (var displayNode in displayNodes) {
        if (node.getEnable(displayNodes[displayNode])) {
          enabledDisplays[index] = {
            name: node.getName(displayNodes[displayNode]),
            path: displayNodes[displayNode],
          };
        }
        index++;
      }

      var index = 0;
      for (var preset in renderPresets) {
        if (renderPresets[preset].render_enabled) {
          enabledPresets[index] = renderPresets[preset];
        }
        index++;
      }
    }

    if (Object.keys(enabledPresets).length === 0) {
      // this.ui.setCurrentWidget(this.ui.main);
      this.errorMessage(
        "No enabled presets to render\nEnable at least one to continue"
      );
      throw new Error(
        "No enabled presets to render. Enable at least one to continue"
      );
    }
    if (Object.keys(enabledDisplays).length === 0) {
      // this.ui.setCurrentWidget(this.ui.main);
      this.errorMessage(
        "No enabled display nodes to render\nEnable at least one to continue"
      );
      throw new Error(
        '"No enabled presets to render. Enable at least one to continue"'
      );
    }

    for (var preset in enabledPresets) {
      for (var renderDisplay in enabledDisplays) {
        // If interrupt button gets clicked, stop all renders at next render start
        if (this.interruptRender) {
          throw new Error("Render Interrupted");
        }
        var currentDisplay = enabledDisplays[renderDisplay];
        var currentPreset = enabledPresets[preset];

        if (
          !currentPreset["resolution_x"] ||
          !currentPreset["resolution_y"] ||
          (!currentPreset["render_formats"]["mov"] &&
            !currentPreset["render_formats"]["pngseq"])
        ) {
          this.errorMessage(
            'Preset "' +
              currentPreset["preset_name"] +
              '" has missing fields.\nPlease configure those and try again.'
          );
          throw new Error(
            'Preset "' +
              currentPreset["preset_name"] +
              '" has missing fields.\nPlease configure those and try again.'
          );
        }

        // Give a simple filename template to the preset if the user forgets to set it, or sets it blank
        if (
          !currentPreset["output_name_format"] ||
          currentPreset["output_name_format"] === ""
        ) {
          currentPreset["output_name_format"] = "#SceneName#-#DisplayNode#";
        }
        if (
          !currentPreset["output_fileseq_format"] ||
          currentPreset["output_fileseq_format"] === ""
        ) {
          currentPreset["output_fileseq_format"] = "#######";
        }

        var renderFullOutputPath =
          this.outputFolder + "/" + currentPreset["output_name_format"];

        renderFullOutputPath = renderFullOutputPath.replace(
          /#SceneName#/g,
          scene.currentScene()
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#SceneVersion#/g,
          "v" + scene.currentVersion()
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#SceneVersionName#/g,
          scene.currentVersionName()
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#PresetName#/g,
          currentPreset.preset_name
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Resolution#/g,
          "[" +
            currentPreset.resolution_x +
            "x" +
            currentPreset.resolution_y +
            "]"
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#DisplayNode#/g,
          currentDisplay.name
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#DateTime#/g,
          this.now().dateTime
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Date#/g,
          this.now().date
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Time#/g,
          this.now().time
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Year#/g,
          this.now().year
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Month#/g,
          this.now().month
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Day#/g,
          this.now().day
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Hour#/g,
          this.now().hour
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Minute#/g,
          this.now().minute
        );
        renderFullOutputPath = renderFullOutputPath.replace(
          /#Second#/g,
          this.now().second
        );

        if (this.renderMode == "Advanced") {
          this.log(
            "Rendering " +
              currentPreset.preset_name +
              " using " +
              currentDisplay.name +
              " display..."
          );
          progressWidget.progressText.text =
            "Preset: " +
            currentPreset.preset_name +
            "\n" +
            "Display Node: " +
            currentDisplay.name +
            "\n" +
            "Aspect Ratio: " +
            currentPreset.aspect_ratio +
            "\n" +
            "Resolution: " +
            currentPreset.resolution_x +
            "x" +
            currentPreset.resolution_y +
            "\n";
        }

        if (currentPreset.render_formats.mov) {
          var finalFileName = renderFullOutputPath.replace(
            /#RenderFormat#/g,
            "Quicktime"
          );

          progressWidget.progressText.text +=
            "Format: " + "MOV (Quicktime)" + "\n";

          this.movRenderer.call(
            this,
            this.versionedPath(finalFileName + ".mov"),
            currentPreset.resolution_x,
            currentPreset.resolution_y,
            currentDisplay.name,
            progressWidget
          );
        }
        if (currentPreset.render_formats.pngseq) {
          finalFileName = renderFullOutputPath.replace(
            /#RenderFormat#/g,
            "PNGSequence"
          );

          progressWidget.progressText.text +=
            "Format: " + "PNG Sequence" + "\n";

          this.pngRenderer.call(
            this,
            this.versionedPath(finalFileName),
            currentPreset.resolution_x,
            currentPreset.resolution_y,
            currentDisplay.path,
            currentPreset.output_fileseq_zero_padding,
            progressWidget
          );
        }
      }
    }

    // Open render output folder when called from the toolbar
    if (this.renderMode == "Simple") {
      this.openFolder.call(this, this.outputFolder);
    }
    // Set Successful Render State
    this.renderSuccess = true;
  } catch (error) {
    this.renderSuccess = false;
    MessageLog.trace(error);
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

      this.ui.progress.renderProgress.progressText.text =
        "Creating MOV file...";
      this.ui.progress.renderProgress.progressBar.setMaximum(0);
      this.ui.progress.renderProgress.progressBar.setMinimum(0);
      this.ui.progress.renderProgress.progressBar.setValue(0);

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

      this.ui.progress.renderProgress.progressBar.setMaximum(100);
      this.ui.progress.renderProgress.progressBar.setMinimum(0);
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
  zeroPadding,
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

    // // Zipper Function for future Implementation
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

EzRender.prototype.errorMessage = function (error) {
  var messageDialog = new QMessageBox(
    QMessageBox.NoIcon,
    "",
    error,
    QMessageBox.Ok,
    this.ui
  );
  this.refreshPresetsAndDisplays();
  messageDialog.show();
};

EzRender.prototype.now = function () {
  var now = new Date();
  return {
    date:
      now.getFullYear() +
      "" +
      ("0" + (now.getMonth() + 1)).slice(-2) +
      "" +
      ("0" + now.getDate()).slice(-2),
    time:
      ("0" + now.getHours()).slice(-2) +
      "" +
      ("0" + now.getMinutes()).slice(-2) +
      "" +
      ("0" + now.getSeconds()).slice(-2),
    dateTime:
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
      ("0" + now.getSeconds()).slice(-2),
    year: now.getFullYear(),
    month: "0" + (now.getMonth() + 1),
    day: ("0" + now.getDate()).slice(-2),
    hour: ("0" + now.getHours()).slice(-2),
    minute: ("0" + now.getMinutes()).slice(-2),
    second: ("0" + now.getSeconds()).slice(-2),
  };
};

// Logging and debuging functions
EzRender.prototype.log = function (string) {
  if (this.debug == true)
    MessageLog.trace(
      "[ " + this.packageInfo.packageFullName + " ] > " + string
    );
};

exports.EzRender = EzRender;
