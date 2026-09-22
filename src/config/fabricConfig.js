'use strict';

const config = require('./env');

const fabricConfig = Object.freeze({
  enabled: config.fabric.enabled,
  channelName: config.fabric.channelName,
  chaincodeName: config.fabric.chaincodeName,
  mspId: config.fabric.mspId,
  identityName: config.fabric.identityName,
  connectionProfilePath: config.fabric.connectionProfilePath,
  certPath: config.fabric.certPath,
  privateKeyPath: config.fabric.privateKeyPath,
  peerEndpoint: config.fabric.peerEndpoint,
  discoveryEnabled: config.fabric.discoveryEnabled,
});

module.exports = fabricConfig;
