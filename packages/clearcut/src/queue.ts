/**
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const CACHE_KEY = '@firebase/clearcut-cache';
const PROCESS_CACHE_OFFSET_KEY = '@firebase/clearcut-time-cache';

export interface batchEvt {
  logSource: string,
  message: string,
  eventTime: number
};

const validEvent = evt => evt.logSource && evt.message && evt.eventTime;

/**
 * Because we don't want to overload clearcut, we should batch queries as much
 * as possible. That said we don't want to miss events, so we'll keep them in
 * localStorage. Fetch them if they exist.
 */
let queue: batchEvt[] = (cache => {
  /**
   * If there is no cache, bail
   */
  if (!cache) return [];

  /**
   * Because this can fail, 
   */
  try {
    let parsed = JSON.parse(cache);
  
    /**
     * Validate parsed is a proper cache, return an empty cache otherwise
     */
    if (!Array.isArray(parsed)) {
      return [];
    }
    if (!parsed.every(evt => validEvent(evt))) {
      return [];
    }

    /**
     * If cache is valid, pass the cache along
     */
    return parsed;
  } catch(err) {
    return [];
  }

})(localStorage.getItem(CACHE_KEY));

const PROCESS_CACHE_OFFSET = (cache => {
  const now = Date.now();
  /**
   * If there is no cached offset time, set offset to 0
   */
  if (!cache) return 0;

  /**
   * If the requested offset has passed, set the offset to 0
   */
  const time = new Date(cache).getTime();
  if (time <= now) return 0;
  
  return time - now;
})(localStorage.getItem(PROCESS_CACHE_OFFSET_KEY));

const processQueue = (timeOffset: number) => {
  setTimeout(() => {
    console.log('Processing queue', queue);

    /**
     * If there are no events to process, wait 5 seconds and try again
     */
    if (!queue.length) {
      return processQueue(5000);
    }

    /**
     * Capture a snapshot of the queue and empty the "official queue"
     */
    const staged = [...queue];
    queue = [];

    /**
     * Build the request object
     */
    const baseData = {
      request_time_ms: Date.now(),
      client_info: {
        client_type: 1,
        js_client_info: {}
      }
    };

    /**
     * Break the log queue into a map of logSources and associated events
     */
    const mapLogSourceToEvents: { 
      [logSource: string]: batchEvt[] 
    } = queue.reduce((map, evt) => {
      if (!map[evt.logSource]) map[evt.logSource] = [];
      map[evt.logSource] = [...map[evt.logSource], evt];
      return map;
    }, {});

    /**
     * Map each logSource onto a request to submit those types of events
     */
    const requests = Object.keys(mapLogSourceToEvents)
      .map(logSource => {
        const chunk = mapLogSourceToEvents[logSource];

        /**
         * We will pass the JSON serialized event to the backend
         */
        const log_event = chunk.map(evt => ({
          source_extension_json: JSON.stringify(evt.message),
          event_time_ms: evt.eventTime
        }));
        const log_source = chunk.reduce((source, evt) => source || evt.logSource, null);

        const data = Object.assign({}, baseData, {
          log_source,
          log_event
        });

        /**
         * POST the logs to clearcut
         */
        return fetch("https://jmt17.google.com/log?format=json_proto", {
          method: "POST",
          body: JSON.stringify(data)
        })
        .then(res => res.json())
        /**
         * If the request fails for some reason, add the events that were attempted
         * back to the primary queue to retry later
         */
        .catch(err => {
          queue = [
            ...chunk,
            ...queue
          ];
          throw err;
        });
      });

    
    /**
     * If succesful then we can register the next POST attempt
     */
    Promise.all(requests)
    /**
     * We will receive multiple next request offsets, defer for the longest requested period
     */
    .then(resArray => {
      return resArray.reduce((offset, res) => Math.max(offset, parseInt(res.next_request_wait_millis, 10)), 0);
    })
    /**
     * Cache the requested offset time and schedule the next process
     */
    .then(requestOffset => {
      localStorage.setItem(PROCESS_CACHE_OFFSET_KEY, Date.now() + requestOffset);
      processQueue(requestOffset);
    })
    /**
     * If we failed then we retry in 5 seconds
     */
    .catch(err => {
      processQueue(5000);
    });
  }, timeOffset);
};

processQueue(PROCESS_CACHE_OFFSET);

export default function(evt: batchEvt) {
  /**
   * Validate event
   */
  if (!validEvent(evt)) throw new Error('Attempted to queue invalid clearcut event');

  /**
   * Capture event in the queue
   */
  queue = [
    ...queue,
    evt
  ];
}
