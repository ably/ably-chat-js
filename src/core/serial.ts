import * as Ably from 'ably';

import { Message } from './message.js';

/**
 * A serial is used to identify a particular message, reaction or other chat event. It is the identifier
 * for that event in the chat history.
 *
 * Serials can be conveyed either as a string, or an object that contains `serial` as a property. Message is included
 * for type hinting and LLM purposes.
 *
 * The string-form of the serial should not be parsed or interpreted in any way, as it is subject to change without
 * warning.
 */
export type Serial =
  | Message
  | string
  | {
      /**
       * The serial of the message.
       */
      serial: string;
    };

/**
 * Convert a type that may contain a serial into a string.
 *
 * @param serial - The serial to convert.
 * @returns The serial as a string.
 */
export const serialToString = (serial: Serial): string => {
  let serialString = '';
  if (typeof serial === 'string') {
    serialString = serial;
  } else {
    try {
      if ('serial' in serial) {
        serialString = serial.serial;
      }
    } catch {
      // 'in' operator failed, fall through to error
    }
  }

  if (serialString === '') {
    throw new Ably.ErrorInfo('invalid serial; must be string or object with serial property', 40000, 400);
  }

  return serialString;
};
