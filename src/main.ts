import { createWorker, types } from 'mediasoup';

import { RtpCodecCapability } from 'mediasoup/node/lib/rtpParametersTypes.js';
import { Server } from 'socket.io';
import { SocketIO } from './enums/socket.js';
import express from 'express';

const app = express();

const io = new Server(8000, {
  cors: {
    origin: 'http://localhost:3000',
  },
});

const socket = io.of('/peers');

socket.on(SocketIO.Connection, (socket) => {
  console.log('a user connected');
  socket.emit(SocketIO.ConnectionSuccess, socket.id);
  socket.on(SocketIO.Disconnect, () => {
    console.log('user disconnected');
  });
});

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      useinbandfec: 1,
    },
    rtcpFeedback: [
      { type: 'transport-cc' },
      { type: 'ccm', parameter: 'fir' },
      { type: 'nack' },
      { type: 'nack', parameter: 'pli' },
    ],
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
    rtcpFeedback: [
      { type: 'transport-cc' },
      { type: 'ccm', parameter: 'fir' },
      { type: 'nack' },
      { type: 'nack', parameter: 'pli' },
    ],
  },
];

let worker: types.Worker;
let router: types.Router;
let transport: types.WebRtcTransport;

createWorker().then((w) => {
  worker = w;
});

worker
  ?.createRouter({ mediaCodecs })
  .then((r) => {
    router = r;
  })
  .catch((err) => {
    console.error(err);
  });
const rtpCapabilities = router?.rtpCapabilities;

router
  ?.createWebRtcTransport({
    listenIps: [
      {
        ip: '127.0.0.1:8002',
        announcedIp: '127.0.0.1:8001',
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  })
  .then((t) => {
    transport = t;
  })
  .catch((err) => {
    console.error(err);
  });

socket.on(SocketIO.RTPCapabilities, (data, callback) => {
  callback(rtpCapabilities);
  console.log('Router RTP Capabilities:', rtpCapabilities);
  console.log('Router RTP Capabilities:', data);
});

app.get('/', (_, res) => {
  res.json({
    transport: transport,
    worker: worker,
    rtpCapabilities: router?.rtpCapabilities,
  });
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
