import _ from 'lodash';
import { createDirectCliJob } from './eco-helpers';

const apps = [
  createDirectCliJob('run-fetch-service', '--pause-before-exit=true'),
  createDirectCliJob('run-extraction-service', '--post-results=true'),
  createDirectCliJob('run-monitor-service', '--send-notification=true --start-server --port=9200'),
];

module.exports = {
  apps
};
