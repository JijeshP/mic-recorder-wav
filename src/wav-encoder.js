class WavEncoder {
  constructor(config) {
    this.config = {
      sampleRate: 44100,
      bitRate: 128
    };

    this.sampleRate = 44100;
    this.numChannels = 1;
    this.numSamples = 0;
    this.dataViews = [];

    // Audio is processed by frames of 1152 samples per audio channel
    // http://lame.sourceforge.net/tech-FAQ.txt
    this.maxSamples = 1152;

    this.samplesMono = null;
    this.cleanup();
  }

  setString(view, offset, str) {
    var len = str.length;
    for (var i = 0; i < len; ++i)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  encode(buffer) {

    var len = buffer[0].length,
      nCh = this.numChannels,
      view = new DataView(new ArrayBuffer(len * nCh * 2)),
      offset = 0;
    for (var i = 0; i < len; ++i)
      for (var ch = 0; ch < nCh; ++ch) {
        var x = buffer[ch][i] * 0x7fff;
        view.setInt16(offset, x < 0 ? Math.max(x, -0x8000) : Math.min(x, 0x7fff), true);
        offset += 2;
      }

    this.dataViews.push(view);
    this.numSamples += len;
  }


  cleanup() {
    this.dataBuffer = [];
  }

  floatTo16BitPCM(input, output) {
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF);
    }
  }
  convertBuffer(arrayBuffer) {
    const data = new Float32Array(arrayBuffer);
    const out = new Int16Array(arrayBuffer.length);
    this.floatTo16BitPCM(data, out);

    return out;
  }

  finish() {
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
    var blob = new Blob(this.dataViews, {
      type: 'audio/wav'
    });
    this.cleanup();
    return blob;
  }
};

export default WavEncoder;
