import _ from 'lodash';
import Redis from 'ioredis';
import Async from 'async';
import winston from 'winston';
import { getServiceLogger, newIdGenerator, prettyFormat } from '@watr/commonlib';

import {
  Message,
  Thunk,
  MessageKind,
  MessageHandler,
  MessageHandlerDef,
  Yield,
  matchMessageToQuery,
  MessageQuery,
  PingKind
} from './message-types';

import { newRedisClient } from './ioredis-conn';
import { Ack, addHeaders, QuitKind } from '.';

export interface CommLink<ClientT> {
  name: string;
  log: winston.Logger;

  on(m: MessageQuery, h: MessageHandler<ClientT>): void;
  send(message: Message): Promise<void>;
  call<A>(f: string, a: A): Promise<A>;
  callAndAwait<A>(a: A, m: MessageKind, h: MessageHandler<ClientT>): Promise<A>;
  connect(clientT: ClientT): Promise<void>;
  quit(): Promise<void>;

  // Internal use:
  subscriber: Redis.Redis;
  messageHandlers: MessageHandlerDef<ClientT>[];
  isShutdown: boolean;
}

const nextId = newIdGenerator(1);

export function newCommLink<ClientT>(name: string): CommLink<ClientT> {
  const commLink: CommLink<ClientT> = {
    name,
    subscriber: newRedisClient(name),
    isShutdown: false,
    log: getServiceLogger(`${name}/comm`),
    messageHandlers: [],

    async call<A>(f: string, a: A): Promise<A> {
      const yieldId = nextId();
      const toYield = Message.address(Yield(f, a), { id: yieldId, from: name, to: name });

      return this.send(toYield);
    },

    async callAndAwait<A>(a: A, m: MessageKind, h: MessageHandler<ClientT>): Promise<A> {
      const responseP = this.on(m, h);
      const yieldP = this.call(a);
      // const responseP = new Promise<A>((resolve) => {
      //   self.addHandler(
      //     `${yieldId}:.*:${this.name}>yielded`,
      //     async (msg: Message) => {
      //       if (msg.kind !== 'yielded') return;
      //       resolve(msg.value);
      //     });
      // });

      return yieldP.then(() => responseP);
    },

    async send(msg: Message): Promise<void> {
      const addr = Message.address(
        msg, { from: name }
      );
      const packedMsg = Message.pack(addr);

      if (this.isShutdown) {
        this.log.warn(`${name}> shutdown; not sending message ${packedMsg}`);
        return;
      }
      const { to } = msg;

      const publisher = this.subscriber.duplicate();
      await publisher.publish(to, packedMsg);
      this.log.verbose(`publishing ${packedMsg}`);
      await publisher.quit();
    },

    on(m: MessageQuery, h: MessageHandler<ClientT>): void {
      this.messageHandlers.push([m, h]);
    },

    async connect(clientT: ClientT): Promise<void> {
      const { subscriber, log } = this;

      return new Promise((resolve, reject) => {
        subscriber.on('message', (channel: string, packedMsg: string) => {
          log.verbose(`${name} received> ${packedMsg}`);

          const message = Message.unpack(packedMsg);

          const handlersForMessage = getMessageHandlers<ClientT>(message, packedMsg, commLink, clientT);

          Async.mapSeries(handlersForMessage, async (handler: Thunk) => handler())
            .catch((error) => {
              log.warn(`> ${packedMsg} on ${channel}: ${error}`);
            });
        });

        subscriber.subscribe(`${name}`)
          .then(() => log.info(`${name}> connected`))
          .then(() => resolve())
          .catch((error: any) => {
            const msg = `subscribe> ${error}`;
            reject(new Error(msg));
          });
      });
    },
    async quit(): Promise<void> {
      const self = this;
      return new Promise((resolve) => {
        self.subscriber.on('end', () => resolve());
        self.isShutdown = true;
        self.subscriber.quit();
      });
    }
  };

  commLink.on(PingKind, async (msg: Message) => {
    const reply = addHeaders(Ack(msg), { from: msg.to, to: msg.from, id: msg.id });
    await commLink.send(reply);
  });
  // commLink.on(CallKind('push'), async (msg: Message) => {
  //   if (msg.kind !== 'push') return;
  //   return this.sendHub(msg.msg);
  // });
  commLink.on(QuitKind, async (msg: Message) => {
    const reply = addHeaders(Ack(msg), { from: msg.to, to: msg.from, id: msg.id });
    await commLink.send(reply);
    await commLink.quit();
  });


  return commLink;
}

function getMessageHandlers<ClientT>(
  message: Message,
  packedMsg: string,
  commLink: CommLink<ClientT>,
  clientT: ClientT
): Thunk[] {
  const { messageHandlers } = commLink;

  commLink.log.silly(`finding message handlers for ${packedMsg}`);
  const matchedHandlers = _.filter(messageHandlers, ([handlerKind,]) => {
    const matches = matchMessageToQuery(handlerKind, message);
    const hpf = prettyFormat(handlerKind);
    commLink.log.silly(`testing msg ~= ${hpf}? (match=${matches})`);

    return matches;
  });

  const handlers = _.map(matchedHandlers, ([handlerKind, handler]) => {
    const hk = prettyFormat(handlerKind);
    commLink.log.silly(`found message handler ${hk} for ${packedMsg}`);
    const bh = _.bind(handler, clientT);
    return () => bh(message);
  });

  return handlers;
}



    // addDispatches(dispatches: DispatchHandlers<ClientT>): void {
    //   // commLink.addHandler(`dispatch/${functionName}`, async function(msg) {
    //   //   if (msg.kind !== 'dispatch') return;
    //   //   const { func, arg } = msg;
    //   //   const f = commLink.dispatchHandlers[func];
    //   //   if (f !== undefined) {
    //   //     const bf = _.bind(f, this);
    //   //     const result = await bf(arg);
    //   //     const yld = result === undefined ? null : result;

    //   //     await commLink.send(
    //   //       Address(
    //   //         Yield(yld), { id: msg.id, to: currService }
    //   //       )
    //   //     );
    //   //   }
    //   // });
    //   const all = {
    //     ...this.dispatchHandlers,
    //     ...dispatches,
    //   };
    //   this.dispatchHandlers = all;
    // },
