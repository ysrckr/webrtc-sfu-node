import { AppData, Consumer, Producer } from 'mediasoup/node/lib/types.js';

import { RtpCodecCapability } from 'mediasoup/node/lib/rtpParametersTypes.js';
import { Server } from 'socket.io';
import { SocketIO } from './enums/socket.js';
import { WebRtcTransport } from 'mediasoup/node/lib/WebRtcTransportTypes.js';
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

const socket = io.of(`/peers`);

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

let producerTransport: WebRtcTransport<AppData>;
let consumerTransport: WebRtcTransport<AppData>;
const producers: Producer<AppData>[] = [];
const consumers: Consumer<AppData>[] = [];

socket.on(SocketIO.Connection, (socket) => {
  console.log('a user connected');
  socket.emit(SocketIO.ConnectionSuccess, socket.id);
  socket.on(SocketIO.Disconnect, () => {
    console.log('user disconnected');
  });

  socket.on(SocketIO.RTPCapabilities, (callback) => {
    const rtpCapabilities = router?.rtpCapabilities;

    callback({ rtpCapabilities });
  });

  socket.on(SocketIO.CreateWebRtcTransport, async ({ sender }, callback) => {
    console.log(`Is this a sender request? ${sender}`);

    if (sender) producerTransport = await createWebRtcTransport(callback);
    else consumerTransport = await createWebRtcTransport(callback);
  });

  socket.on(SocketIO.ConnectTransport, async ({ dtlsParameters }) => {
    console.log('DTLS PARAMS... ', { dtlsParameters });
    await producerTransport.connect({ dtlsParameters });
  });

  socket.on(
    SocketIO.TransportProduce,
    async ({ kind, rtpParameters }, callback) => {
      const producer = await producerTransport.produce({
        kind,
        rtpParameters,
      });

      producers.push(producer);

      console.log('Producer ID: ', producer.id, producer.kind);

      producer.on('transportclose', () => {
        console.log('transport for this producer closed ');
        producer.close();
      });

      callback({
        id: producer.id,
        rtpParameters: producer.rtpParameters,
      });
    },
  );

  socket.on(SocketIO.TransportRCVConnect, async ({ dtlsParameters }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`);

    await consumerTransport.connect({ dtlsParameters });
  });

  socket.on(SocketIO.Consume, async ({ rtpCapabilities }, callback) => {
    producers.forEach(async (producer) => {
      try {
        if (router?.canConsume({ producerId: producer.id, rtpCapabilities })) {
          const consumer = await consumerTransport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: false,
          });

          consumers.push(consumer);

          consumer.on('transportclose', () => {
            console.log('transport close from consumer');
          });

          consumer.on('producerclose', () => {
            console.log('producer of consumer closed');
          });

          const params = {
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          };

          callback({ params });
        }
      } catch (error) {
        console.log(error);
      }
    });
  });

  socket.on(SocketIO.ResumeConsumer, async () => {
    console.log('consumer resume');
    consumers.forEach(async (consumer) => {
      await consumer.resume();
    });
  });
});

async function createWebRtcTransport(
  callback,
): Promise<WebRtcTransport<AppData> | null> {
  try {
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: '0.0.0.0', // replace with relevant IP address
          announcedIp: '127.0.0.1',
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };

    const transport = await router.createWebRtcTransport(
      webRtcTransport_options,
    );
    console.log(`transport id: ${transport.id}`);

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('@close', () => {
      console.log('transport closed');
    });

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });

    return transport;
  } catch (error) {
    console.log(error);
    callback({
      params: {
        error: error,
      },
    });
    return null;
  }
}

app.get('/', (_, res) => {
  res.json({
    worker: worker,
    rtpCapabilities: router?.rtpCapabilities,
    producerTransport,
    consumerTransport,
  });
});

io.listen(PORT);
