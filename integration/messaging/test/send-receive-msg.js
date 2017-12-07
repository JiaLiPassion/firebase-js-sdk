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

const seleniumAssistant = require('selenium-assistant');
const seleniumFirefox = require('selenium-webdriver/firefox');
const seleniumChrome = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const expect = require('chai').expect;

const testServer = require('./utils/test-server.js');

//const ENDPOINT = 'https://fcm.googleapis.com';
const ENDPOINT = 'https://jmt17.google.com';

describe.skip('Firebase Messaging Integration Tests', () => {
  before(function() {
    return testServer.start();
  });

  after(function() {
    return testServer.stop();
  });

  const performTestInBrowser = seleniumBrowser => {
    // Mocha must have functions in describe and it functions due to its
    // binding behavior
    describe(`Test Messaging in ${seleniumBrowser.getPrettyName()}`, function() {
      this.timeout(30 * 1000);
      this.retries(2);

      let server;
      let currentWebDriver;

      before(function() {
        this.timeout(10 * 1000);
      });

      after(function() {
        this.timeout(10 * 1000);

        if (currentWebDriver) {
          return seleniumAssistant.killWebDriver(currentWebDriver);
        }
      });

      const getInPageToken = () => {
        return currentWebDriver
          .wait(() => {
            return currentWebDriver.executeScript(() => {
              return document.querySelector('.js-token').textContent.length > 0;
            });
          })
          .then(() => {
            return currentWebDriver.executeScript(() => {
              return document.querySelector('.js-token').textContent;
            });
          });
      };

      const sendFCMMessage = (endpoint, apiBody) => {
        return fetch(`${endpoint}/fcm/send`, {
          method: 'POST',
          body: JSON.stringify(apiBody),
          headers: {
            Authorization: 'key=AIzaSyCqJkOa5awRsZ-1EyuAwU4loC3YXDBouIo',
            'Content-Type': 'application/json'
          }
        })
          .then(response => {
            // FCM will return HTML if there is an error so we can't parse
            // the response as JSON, instead have to read as text, then parse
            // then handle the possible error.
            return response.text().then(responseText => {
              try {
                return JSON.parse(responseText);
              } catch (err) {
                throw new Error(`Unexpected response: '${responseText}'`);
              }
            });
          })
          .then(responseObj => {
            if (responseObj.success !== 1) {
              throw new Error(
                'Unexpected response: ' + JSON.stringify(responseObj)
              );
            }
          });
      };

      const getInPageMessage = () => {
        return currentWebDriver
          .wait(() => {
            return currentWebDriver.executeScript(() => {
              return (
                document.querySelectorAll('.js-message-list > li').length > 0
              );
            });
          })
          .then(() => {
            return currentWebDriver.executeScript(() => {
              return document.querySelector('.js-message-list > li:first-child')
                .textContent;
            });
          });
      };

      const performTest = (dataPayload, notificationPayload, context) => {
        return currentWebDriver
          .get(`${testServer.serverAddress}/demo-valid/`)
          .then(() => getInPageToken())
          .then(fcmToken => {
            const fcmAPIPayload = {};
            fcmAPIPayload.to = fcmToken;

            if (dataPayload != null) {
              fcmAPIPayload.data = dataPayload;
            }

            if (notificationPayload != null) {
              fcmAPIPayload.notification = notificationPayload;
            }

            return sendFCMMessage(PROD_ENDPOINT, fcmAPIPayload);
          })
          .then(() => {
            return getInPageMessage();
          })
          .then(inPageMessage => {
            const inPageObj = JSON.parse(inPageMessage);
            if (dataPayload) {
              expect(inPageObj.data).to.deep.equal(dataPayload);
            } else {
              expect(typeof inPageObj.data).to.equal('undefined');
            }
            if (notificationPayload) {
              expect(inPageObj.notification).to.deep.equal(notificationPayload);
            } else {
              expect(typeof inPageObj.notification).to.equal('undefined');
            }
          })
          .then(() => {
            return new Promise(resolve => setTimeout(resolve, 4000));
          })
          .catch(err => {
            if (seleniumBrowser.getReleaseName() === 'unstable') {
              console.warn(
                chalk`{yellow WARNING: Test failed in unstable browser, skipping}`
              );
              console.warn(err);
              if (context) {
                return context.skip();
              }
            }
            throw err;
          });
      };

      it('should send and receive messages with no payload', function() {
        return performTest(null, null, this);
      });

      it('should send and receive messages with data payload', function() {
        return performTest({ hello: 'world' }, null, this);
      });

      it('should send and receive messages with notification payload', function() {
        return performTest(
          null,
          {
            title: 'Test Title',
            body: 'Test Body',
            icon: '/test/icon.png',
            click_action: '/',
            tag: 'test-tag'
          },
          this
        );
      });

      it('should send and receive messages with data & notification payload', function() {
        return performTest(
          { hello: 'world' },
          {
            title: 'Test Title',
            body: 'Test Body',
            icon: '/test/icon.png',
            click_action: '/',
            tag: 'test-tag'
          },
          this
        );
      });
    });
  };

  const availableBrowsers = seleniumAssistant.getLocalBrowsers();
  availableBrowsers.forEach(assistantBrowser => {
    // Only test on Chrome and Firefox
    if (
      assistantBrowser.getId() !== 'chrome' &&
      assistantBrowser.getId() !== 'firefox'
    ) {
      return;
    }

    performTestInBrowser(assistantBrowser);
  });
});
