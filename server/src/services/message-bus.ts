import { EventEmitter } from 'events';
import type { Response } from 'express';
import { JsonStore } from '../data/store.js';
import type { Message, MessageType } from '../models/types.js';
import { generateId } from '../utils/crypto.js';

const store = new JsonStore<Message>('messages.json');

class MessageBus extends EventEmitter {
  send(from: string, to: string, type: MessageType, payload: Record<string, unknown>, references: string[] = []): Message {
    const message: Message = {
      id: generateId('msg'),
      from,
      to,
      type,
      timestamp: new Date().toISOString(),
      payload,
      references,
    };

    store.append(message);
    this.emit('message', message);
    this.emit(type, message);
    return message;
  }

  getMessages(filter?: { type?: string; from?: string; to?: string; limit?: number }): Message[] {
    let messages = store.readAll();

    if (filter?.type) messages = messages.filter(m => m.type === filter.type);
    if (filter?.from) messages = messages.filter(m => m.from === filter.from);
    if (filter?.to) messages = messages.filter(m => m.to === filter.to || m.to === 'broadcast');

    // Most recent first
    messages.reverse();

    if (filter?.limit) messages = messages.slice(0, filter.limit);
    return messages;
  }

  createSSEHandler() {
    return (req: { agent?: { id: string }; on?: Function }, res: Response) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Keepalive
      const keepalive = setInterval(() => {
        res.write(':keepalive\n\n');
      }, 30_000);

      const onMessage = (msg: Message) => {
        if (msg.to === 'broadcast' || msg.to === req.agent?.id) {
          res.write(`data: ${JSON.stringify(msg)}\n\n`);
        }
      };

      this.on('message', onMessage);

      req.on?.('close', () => {
        clearInterval(keepalive);
        this.removeListener('message', onMessage);
      });

      // Initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
    };
  }
}

export const messageBus = new MessageBus();
