import WavEncoder from './wav-encoder';

class MicRecorder {
  constructor(config) {
    this.config = {
      // 128 or 160 kbit/s – mid-range bitrate quality
      bitRate: 128,
      // There is a known issue with some macOS machines, where the recording
      // will sometimes have a loud 'pop' or 'pop-click' sound. This flag
      // prevents getting audio from the microphone a few milliseconds after
      // the begining of the recording. It also helps to remove the mouse
      // "click" sound from the output mp3 file.
      startRecordingAt: 300,
      deviceId: null,
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
  addMicrophoneListener(stream) {
    this.activeStream = stream;

    // This prevents the weird noise once you start listening to the microphone
    this.timerToStart = setTimeout(() => {
      delete this.timerToStart;
    }, this.config.startRecordingAt);

    // Set up Web Audio API to process data from the media stream (microphone).
    this.microphone = this.context.createMediaStreamSource(stream);

    // Settings a bufferSize of 0 instructs the browser to choose the best bufferSize
    this.processor = this.context.createScriptProcessor(0, 1, 1);

    // Add all buffers from LAME into an array.
    this.processor.onaudioprocess = (event) => {
      if (this.timerToStart) {
        return;
      }
        var buffers = [];
        buffers[0] = event.inputBuffer.getChannelData(0);
      // Send microphone data to LAME for MP3 encoding while recording.
      this.wavEncoder.encode(buffers);
    };

    // Begin retrieving microphone data.
    this.microphone.connect(this.processor);
    this.processor.connect(this.context.destination);
  };

  /**
   * Disconnect microphone, processor and remove activeStream
   */
  stop() {
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
      this.activeStream.getAudioTracks().forEach(track => track.stop());
    }

    return this;
  };

  /**
   * Requests access to the microphone and start recording
   * @return Promise
   */
  start() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext({sampleRate: 16000});
    this.config.sampleRate = this.context.sampleRate;
 
    this.wavEncoder = new WavEncoder()

    const audio = this.config.deviceId ? { deviceId: { exact: this.config.deviceId } } : true;

    return new Promise((resolve, reject) => {
      navigator.mediaDevices.getUserMedia({ audio })
        .then(stream => {
          this.addMicrophoneListener(stream);
          resolve(stream);
        }).catch(function(err) {
          reject(err);
        });
    })
  };

  /**
   * Return Wav Buffer and Blob with type mp3
   * @return {Promise}
   */
  getWav() {
    const finalBlob = this.wavEncoder.finish();
    return new Promise((resolve, reject) => {
      if (!finalBlob) {
        reject(new Error('No buffer to send'));
      } else {
        resolve(['finalBuffer', finalBlob]);
        this.wavEncoder.cleanup();
      }
    });
  };
};

export default MicRecorder;
