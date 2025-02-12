import { RtpCodecCapability } from 'mediasoup/node/lib/rtpParametersTypes.js';
import { Server } from 'socket.io';
import { SocketIO } from './enums/socket.js';
import { createServer } from 'node:http';
import { createWorker } from 'mediasoup';
import express from 'express';

const PORT = +process.env.PORT || 8000;
const app = express();

const io = new Server(createServer(app), {
  cors: {
    origin: 'https://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const socket = io.of('/peers');

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

const worker = await createWorker();

const router = await worker?.createRouter({ mediaCodecs });
console.log('router', router);
console.log('router', router);

// const transport = await router?.createWebRtcTransport({
//   listenIps: [
//     {
//       ip: '127.0.0.1:8002',
//       announcedIp: '127.0.0.1:8001',
//     },
//   ],
//   enableUdp: true,
//   enableTcp: true,
//   preferUdp: true,
// });

let producerTransport;
let consumerTransport;

socket.on(SocketIO.Connection, (socket) => {
  console.log('a user connected');
  socket.emit(SocketIO.ConnectionSuccess, socket.id);
  socket.on(SocketIO.Disconnect, () => {
    console.log('user disconnected');
  });

  socket.on(SocketIO.RTPCapabilities, (callback) => {
    const rtpCapabilities = router?.rtpCapabilities;

    console.log('rtp Capabilities', rtpCapabilities);

    // call callback from the client and send back the rtpCapabilities
    callback({ rtpCapabilities });
  });

  socket.on(SocketIO.CreateWebRtcTransport, async ({ sender }, callback) => {
    console.log(`Is this a sender request? ${sender}`);
    // The client indicates if it is a producer or a consumer
    // if sender is true, indicates a producer else a consumer
    if (sender)
      producerTransport = await router?.createWebRtcTransport(callback);
    else consumerTransport = await router?.createWebRtcTransport(callback);
  });
});

app.get('/', (_, res) => {
  res.json({
    worker: worker,
    rtpCapabilities: router?.rtpCapabilities,
    producerTransport,
    consumerTransport,
  });
});

io.listen(PORT);
