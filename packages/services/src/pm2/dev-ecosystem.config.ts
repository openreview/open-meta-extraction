import { createDirectCliJob } from './eco-helpers';

const apps = [
  createDirectCliJob('run-fetch-service', '--limit=20'),
  createDirectCliJob('run-extraction-service', '--post-results=false --limit=10'),
];


module.exports = {
  apps
};
