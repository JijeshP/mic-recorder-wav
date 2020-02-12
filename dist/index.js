(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.MicRecorder = factory());
}(this, (function () {

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();

var WavEncoder = function () {
  function WavEncoder(config) {
    classCallCheck(this, WavEncoder);

    this.config = {
      sampleRate: 44100,
      bitRate: 128
    };

    this.sampleRate = 16000;
    this.numChannels = 1;
    this.numSamples = 0;
    this.dataViews = [];

    // Audio is processed by frames of 1152 samples per audio channel
    // http://lame.sourceforge.net/tech-FAQ.txt
    this.maxSamples = 1152;

    this.samplesMono = null;
    this.cleanup();
  }

  createClass(WavEncoder, [{
    key: 'setString',
    value: function setString(view, offset, str) {
      var len = str.length;
      for (var i = 0; i < len; ++i) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }
  }, {
    key: 'encode',
    value: function encode(buffer) {

      var len = buffer[0].length,
          nCh = this.numChannels,
          view = new DataView(new ArrayBuffer(len * nCh * 2)),
          offset = 0;
      for (var i = 0; i < len; ++i) {
        for (var ch = 0; ch < nCh; ++ch) {
          var x = buffer[ch][i] * 0x7fff;
          view.setInt16(offset, x < 0 ? Math.max(x, -0x8000) : Math.min(x, 0x7fff), true);
          offset += 2;
        }
      }this.dataViews.push(view);
      this.numSamples += len;
    }
  }, {
    key: 'cleanup',
    value: function cleanup() {
      this.dataBuffer = [];
    }
  }, {
    key: 'floatTo16BitPCM',
    value: function floatTo16BitPCM(input, output) {
      for (var i = 0; i < input.length; i++) {
        var s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
    }
  }, {
    key: 'convertBuffer',
    value: function convertBuffer(arrayBuffer) {
      var data = new Float32Array(arrayBuffer);
      var out = new Int16Array(arrayBuffer.length);
      this.floatTo16BitPCM(data, out);

      return out;
    }
  }, {
    key: 'finish',
    value: function finish() {
      var dataSize = this.numChannels * this.numSamples * 2,
          view = new DataView(new ArrayBuffer(44));
      this.setString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      this.setString(view, 8, 'WAVE');
      this.setString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, this.numChannels, true);
      view.setUint32(24, this.sampleRate, true);
      view.setUint32(28, this.sampleRate * 4, true);
      view.setUint16(32, this.numChannels * 2, true);
      view.setUint16(34, 16, true);
      this.setString(view, 36, 'data');
      view.setUint32(40, dataSize, true);
      this.dataViews.unshift(view);
      var blob = new Blob(this.dataViews, { type: 'audio/wav' });
      this.cleanup();
      return blob;
    }
  }]);
  return WavEncoder;
}();

var MicRecorder = function () {
  function MicRecorder(config) {
    classCallCheck(this, MicRecorder);

    this.config = {
      // 128 or 160 kbit/s – mid-range bitrate quality
      bitRate: 128,
      // There is a known issue with some macOS machines, where the recording
      // will sometimes have a loud 'pop' or 'pop-click' sound. This flag
      // prevents getting audio from the microphone a few milliseconds after
      // the begining of the recording. It also helps to remove the mouse
      // "click" sound from the output mp3 file.
      startRecordingAt: 300,
      deviceId: null
    };

    this.activeStream = null;
    this.context = null;
    this.microphone = null;
    this.processor = null;
    this.startTime = 0;

    Object.assign(this.config, config);
  }

  /**
   * Starts to listen for the microphone sound
   * @param {MediaStream} stream
   */


  createClass(MicRecorder, [{
    key: 'addMicrophoneListener',
    value: function addMicrophoneListener(stream) {
      var _this = this;

      this.activeStream = stream;

      // This prevents the weird noise once you start listening to the microphone
      this.timerToStart = setTimeout(function () {
        delete _this.timerToStart;
      }, this.config.startRecordingAt);

      // Set up Web Audio API to process data from the media stream (microphone).
      this.microphone = this.context.createMediaStreamSource(stream);

      // Settings a bufferSize of 0 instructs the browser to choose the best bufferSize
      this.processor = this.context.createScriptProcessor(0, 1, 1);

      // Add all buffers from LAME into an array.
      this.processor.onaudioprocess = function (event) {
        if (_this.timerToStart) {
          return;
        }
        var buffers = [];
        buffers[0] = event.inputBuffer.getChannelData(0);
        // Send microphone data to LAME for MP3 encoding while recording.
        _this.wavEncoder.encode(buffers);
      };

      // Begin retrieving microphone data.
      this.microphone.connect(this.processor);
      this.processor.connect(this.context.destination);
    }
  }, {
    key: 'stop',


    /**
     * Disconnect microphone, processor and remove activeStream
     */
    value: function stop() {
      if (this.processor && this.microphone) {
        // Clean up the Web Audio API resources.
        this.microphone.disconnect();
        this.processor.disconnect();

        // If all references using this.context are destroyed, context is closed
        // automatically. DOMException is fired when trying to close again
        if (this.context && this.context.state !== 'closed') {
          this.context.close();
        }

        this.processor.onaudioprocess = null;

        // Stop all audio tracks. Also, removes recording icon from chrome tab
        this.activeStream.getAudioTracks().forEach(function (track) {
          return track.stop();
        });
      }

      return this;
    }
  }, {
    key: 'start',


    /**
     * Requests access to the microphone and start recording
     * @return Promise
     */
    value: function start() {
      var _this2 = this;

      var AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext({ sampleRate: 16000 });
      this.config.sampleRate = this.context.sampleRate;

      this.wavEncoder = new WavEncoder();

      var audio = this.config.deviceId ? { deviceId: { exact: this.config.deviceId } } : true;

      return new Promise(function (resolve, reject) {
        navigator.mediaDevices.getUserMedia({ audio: audio }).then(function (stream) {
          _this2.addMicrophoneListener(stream);
          resolve(stream);
        }).catch(function (err) {
          reject(err);
        });
      });
    }
  }, {
    key: 'getWav',


    /**
     * Return Wav Buffer and Blob with type mp3
     * @return {Promise}
     */
    value: function getWav() {
      var _this3 = this;

      var finalBlob = this.wavEncoder.finish();
      return new Promise(function (resolve, reject) {
        if (!finalBlob) {
          reject(new Error('No buffer to send'));
        } else {
          resolve(['finalBuffer', finalBlob]);
          _this3.wavEncoder.cleanup();
        }
      });
    }
  }]);
  return MicRecorder;
}();

return MicRecorder;

})));
//# sourceMappingURL=index.js.map
