# Feature Wishlist

## Desired Features

- [ ] report on disk usage, job timeouts, query profiles, uptime/day
- [X] don't retain htmls and/or cleanup disk space

Note on PM2 usage:
  - logging facilities
  - jobs can run in foreground, pm2 manages stdout
  - cli for full restart

TODO: nb. PM2 scheduling is not used bc I could not for the life of me
get it to work properly, so Bree scheduler is started by pm2, then it
handles scheduling tasks
