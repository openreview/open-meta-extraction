# Command line usage
Two shell scripts are provided, `bin/cli` to run individual commands and `bin/pm2-control` launch services using PM2.

## Config files
Configuration   is   provided  in   files   named   one  of   `config-dev.json`,
`config-test.json`,  or  `config-prod.json`.  It  may  be  placed  in  the  same
directory from  which a `bin/*` script  is run, or any  ancestor directory. Both
command runners `bin/cli` and `bin/pm2-control` accept a `--env <test|dev|prod>`
argument.  This will  select the  correct config  file, as  well as  setting the
NODE_ENV  environment  variable. If  no  `--env`  is specified,  `bin/cli`  will
default to `--env=dev`. Unit tests will use `config-test.json`.

The format for config files is as follows:
```json
{
    "openreview": {
        "restApi": "https://api.openreview.net",
        "restUser": "openreview-username",
        "restPassword": "openreview-password"
    },
    "mongodb": {
        "connectionUrl": "mongodb://localhost:27017/",
        "dbName": "meta-extract-(dev|prod|test)"
    }
}
```

## Running individual commands
Run `bin/cli --help` to see the list of available commands.
```bash
➜  bin/cli
run> node ./packages/services/dist/src/cli
Error:
      You need at least one command before moving on

cli <command>

Commands:
  cli run-fetch-service       Fetch new OpenReview URLs into local DB for
                              spidering/extraction
  cli list-cursors            Show all current cursors
  cli update-cursor           Create/update/delete pointers to last
                              fetched/extracted
  cli run-monitor-service     Periodically send notifications with system
                              monitor report
  cli run-extraction-service  Spider new URLs, extract metadata, and POST
                              results back to OpenReview API
  cli extract-url             Run extraction loop on a single url, nothing is
                              recorded or posted to openreview
  cli mongo-tools             Create/Delete/Update Mongo Database
  cli openreview-api          Interact with OpenReview.net REST API
  cli spider-url              spider the give URL, save results in corpus

Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]

```

### Command examples
```
Spider a URL and save results to local filesystem (delete any previously downloaded files via --clean)
> ./bin/cli spider-url --corpus-root local.corpus.d --url 'https://doi.org/10.3389/fncom.2014.00139' --clean

Spider, then extract metadata from given URL, filesystem only (no mongo db)
> ./bin/cli extract-url --corpus-root local.corpus.d --url 'https://arxiv.org/abs/2204.09028' --log-level debug --clean

Drop/recreate collections in mongo db
> ./bin/cli --env=dev mongo-tools --clean

Fetch a batch of URLs from notes via OpenReview API, store in mongo
> ./bin/cli --env=dev run-fetch-service --offset 100 --count 100

Spider/extract any unprocessed URLs in mongo, optionally posting results back to OpenReview API
> ./bin/cli --env=dev run-extraction-service --post-results=false

Show extraction stats for dev database
> ./bin/cli --env=dev extraction-summary
```

## PM2 launcher
PM2 ecosystem  configs are  found in `packages/services/src/pm2/`,  and compiled
into  `packages/services/dist/src/pm2/`. The  `bin/pm2-control` will  choose the
correct `ecosystem.js`  based on the  `--env` param, set  environment variables,
flush all  prior logs, launch  PM2, then tail the  log files. Press  `Ctrl-C` to
stop tailing logs, it will not affect the running services.

```
> bin/pm2-control
PM2 Control
Usage: bin/pm2-control [--(no-)verbose] [--(no-)dry-run] [--env <ENVMODE>] [--start] [--reset] [--restart] [-h|--help]
        --env: Env Mode; Required. Can be one of: 'dev', 'test' and 'prod' (default: 'unspecified')
        --start: Start pm2 with *-ecosystem.config
        --reset: stop/flush logs/del all
        --restart: reset + start
        -h, --help: Prints help

To restart the system with clean log files:
> bin/pm2-control --env=prod --restart
```
