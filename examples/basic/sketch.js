// "Touché: Enhancing Touch Interaction on Humans, Screens, Liquids, and Everyday Objects" (2012) by Munehiko Sato, Ivan Poupyrev & Chris Harrison
// Port to Arduino by DZL

// For Arduino sketch & PCB design:
// https://github.com/gohai/touch-ml5-kit

let port;
let connectBtn;

let touchBands = 160;
let touchData;
let inData = Array(touchBands);
let inDataBytes = 0;
let scaleMin = 2048;
let scaleMax = -2048;

let classifier;
let state = "training";
let label = "";

function setup() {
  createCanvas(400, 400);
  background(220);

  port = createSerial();

  // in setup, we can open ports we have used previously
  // without user interaction

  let usedPorts = usedSerialPorts();
  if (usedPorts.length > 0) {
    port.open(usedPorts[0], 115200);
  }

  // any other ports can be opened via a dialog after
  // user interaction (see connectBtnClick below)

  connectBtn = createButton("Connect to Arduino");
  connectBtn.position(20, 20);
  connectBtn.mousePressed(connectBtnClick);

  ml5.setBackend("webgl"); // try webgl vs cpu
  classifier = ml5.neuralNetwork({
    task: "classification",
    // also try regression
    debug: true,
  });

  print(
    "Press any key to classify the current touch data with it as the label"
  );
  print("Press t to train");
}

function draw() {
  background(204);

  // changes button label based on connection status
  if (!port.opened()) {
    connectBtn.html("Connect to Arduino");
  } else {
    connectBtn.html("Disconnect");
  }

  let readNewFrame = readTouchData();
  drawData(touchData);

  if (readNewFrame && state == "training" && keyIsPressed) {
    if (key != "t") {
      classifier.addData(touchData, [key]);
      textSize(200);
      textAlign(CENTER, CENTER);
      text(key, width / 2, height / 2);
    }
  } else if (readNewFrame && state == "idle") {
    classifier.classify(touchData, finishedClassifying);
    state = "busy";
  }

  if (label) {
    textSize(200);
    textAlign(CENTER, CENTER);
    text(label, width / 2, height / 2);
  }
}

function keyPressed() {
  if (key == "t" && state == "training") {
    classifier.normalizeData();
    classifier.train(
      {
        epochs: 32,
        batchSize: 12,
      },
      finishedTraining
    );
    state = "busy";
  }
}

function connectBtnClick() {
  if (!port.opened()) {
    port.open("Arduino", 115200);
  } else {
    port.close();
  }
}

function readTouchData() {
  let readNewFrame = false;

  let data = port.readBytes();
  for (let i = 0; i < data.length; i++) {
    // check for frame marker
    if (data[i] & (1 << 7)) {
      if (inDataBytes != 0) {
        //console.warn("Broken frame");
      }
      inData[0] = data[i] & ~(1 << 7);
      inDataBytes = 1;
    } else if (inDataBytes > 0) {
      if (inDataBytes % 2 == 0) {
        inData[inDataBytes / 2] = data[i];
      } else {
        // this is compatible with 12-bit ADCs, even though
        // the current (Arduino Uno) implementation only uses 10
        inData[(inDataBytes - 1) / 2] =
          (inData[(inDataBytes - 1) / 2] << 7) | data[i];
      }
      inDataBytes++;
    }
    // check for full frame
    if (inDataBytes == touchBands * 2) {
      touchData = inData.slice(); // could be optimized
      touchData = centerData(touchData); // this removes any DC offset (centers around mean)
      let derivatives = computeDerivatives(touchData);
      touchData.push(...derivatives[10]); // see below for explanation
      touchData.push(...derivatives[20]);
      touchData.push(...derivatives[40]);
      inDataBytes = 0;
      readNewFrame = true;
    }
  }

  return readNewFrame;
}

function drawData(arr) {
  if (!arr) {
    return;
  }

  let widthPerPoint = width / arr.length;
  // different background for derivative values
  fill(220);
  noStroke();
  rect(widthPerPoint * touchBands, 0, widthPerPoint * arr.length, height);

  let minVal = 2048;
  let maxVal = -2048;
  stroke(218, 59, 95);
  for (let i = 0; i < arr.length - 1; i++) {
    let fromY = map(arr[i], scaleMin, scaleMax, height, 0);
    let toY = map(arr[i + 1], scaleMin, scaleMax, height, 0);
    line(i * widthPerPoint, fromY, (i + 1) * widthPerPoint, toY);
    minVal = min(minVal, arr[i]);
    maxVal = max(maxVal, arr[i]);
  }
  //print("Min: " + minVal + ", Max: " + maxVal);
  scaleMin = min(scaleMin, minVal);
  scaleMax = max(scaleMax, maxVal);
}

function finishedTraining() {
  state = "idle";
}

function finishedClassifying(results, error) {
  //console.log(results);
  label = results[0].label;
  state = "idle";
}

// This calculates the mean and centers all the datapoints around it

function centerData(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  let mean = sum / arr.length;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = arr[i] - mean;
  }
  return arr;
}

// "Additionally, we compute the derivative of the impedance
//  profile at three different levels of aliasing, by down-
//  sampling profiles into arrays of 10, 20, 40 and using
//  [-1, 1] kernel, yielding another 70 features."

function computeDerivatives(arr) {
  let aliasLevels = [10, 20, 40];
  let derivatives = {};

  for (let aliasLevel of aliasLevels) {
    // downsample
    let stepSize = (arr.length - 1) / (aliasLevel - 1);
    derivatives[aliasLevel] = Array(aliasLevel);
    for (let i = 0; i < aliasLevel; i++) {
      derivatives[aliasLevel][i] = arr[round(i * stepSize)];
    }
    // calculate first-order derivative
    for (let i = 0; i < aliasLevel - 1; i++) {
      derivatives[aliasLevel][i] =
        derivatives[aliasLevel][i + 1] - derivatives[aliasLevel][i];
    }
  }
  return derivatives;
}
