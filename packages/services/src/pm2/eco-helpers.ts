import { ENV_MODE } from '@watr/commonlib';
import _ from 'lodash';

const DIRECT_RUN_CLI_SCRIPT = './dist/src/cli/index.js';

export function createPM2Job(name: string, script: string, conf: Partial<PM2JobConfig>): Partial<PM2JobConfig> {
  const cwd = process.cwd();

  return {
    name,
    script,
    cwd,
    env_test: {
      NODE_ENV: 'test',
    },
    env_dev: {
      NODE_ENV: 'dev'
    },
    env_prod: {
      NODE_ENV: 'prod'
    },
    ...conf,
  };
}

export function mungeJobName(
  app: string,
  appNameSuffix?: string
): string {
  const baseName = _.upperFirst(_.camelCase(app));
  const qualifiedName = appNameSuffix ? `${baseName}${appNameSuffix}` : baseName;
  return qualifiedName;
}

export function createDirectCliJob(app: string, args: string): Partial<PM2JobConfig> {
  const qualifiedName = mungeJobName(app);
  const appAndArgs = `${app} ${args}`;
  return createPM2Job(qualifiedName, DIRECT_RUN_CLI_SCRIPT, { args: appAndArgs, autorestart: true });
}


type ENV_KEY = `env_${ENV_MODE}`;

type PM2JobConfig = Record<ENV_KEY, any> & {
  // General
  name: string; // “my-api” application name (default to script filename without extension)
  script: string; // ”./api/app.js” script path relative to pm2 start
  cwd: string; // “/var/www/” the directory from which your app will be launched
  args: string; // “-a 13 -b 12” string containing all arguments passed via CLI to script
  interpreter: string; // “/usr/bin/python” interpreter absolute path (default to node)
  interpreter_args: string; // ”–harmony” option to pass to the interpreter
  node_args: string; //   alias to interpreter_args

  // Advanced
  instances: number; //  -1 number of app instance to be launched
  exec_mode: string; //  “cluster” mode to start your app, can be “cluster” or “fork”, default fork
  watch: boolean; // or [] true enable watch & restart feature, if a file change in the folder or subfolder, your app will get reloaded
  ignore_watch: (string | RegExp)[]; // [”[\/\\]\./”, “node_modules”] list of regex to ignore some file or folder names by the watch feature
  max_memory_restart: string; // “150M” your app will be restarted if it exceeds the amount of memory specified. human-friendly format : it can be “10M”, “100K”, “2G” and so on…
  env: object; // {“NODE_ENV”: “development”, “ID”: “42”} env variables which will appear in your app
  // env_: object; //{“NODE_ENV”: “production”, “ID”: “89”} inject when doing pm2 restart app.yml --env
  source_map_support: boolean; // true default to true, [enable/disable source map file]
  instance_var: string; // “NODE_APP_INSTANCE” see documentation
  filter_env: string[]; // of string [ “REACT_” ] Excludes global variables starting with “REACT_” and will not allow their penetration into the cluster.

  // Logs
  log_date_format: string; // “YYYY-MM-DD HH:mm Z” log date format (see log section)
  error_file: string; //  error file path (default to $HOME/.pm2/logs/XXXerr.log)
  out_file: string; //  output file path (default to $HOME/.pm2/logs/XXXout.log)
  combine_logs: boolean; //   true if set to true, avoid to suffix logs file with the process id
  merge_logs: boolean; //   true alias to combine_logs
  pid_file: string; //  pid file path (default to $HOME/.pm2/pid/app-pm_id.pid)

  // Control Flow
  min_uptime: string; //  min uptime of the app to be considered started
  listen_timeout: number; //  8000 time in ms before forcing a reload if app not listening
  kill_timeout: number; //  1600 time in milliseconds before sending a final SIGKILL
  shutdown_with_message: boolean; //  false shutdown an application with process.send(‘shutdown’) instead of process.kill(pid, SIGINT)
  wait_ready: boolean; //  false Instead of reload waiting for listen event, wait for process.send(‘ready’)
  max_restarts: number; //  10 number of consecutive unstable restarts (less than 1sec interval or custom time via min_uptime) before your app is considered errored and stop being restarted
  restart_delay: number; //  4000 time to wait before restarting a crashed app (in milliseconds). defaults to 0.
  autorestart: boolean; //   false true by default. if false, PM2 will not restart your app if it crashes or ends peacefully
  cron_restart: string; //  “1 0 * * *” a cron pattern to restart your app. Application must be running for cron feature to work
  vizion: boolean; //  false true by default. if false, PM2 will start without vizion features (versioning control metadatas)
  post_update: string[]; //   [“npm install”, “echo launching the app”] a list of commands which will be executed after you perform a Pull/Upgrade operation from Keymetrics dashboard
  force: boolean; //   true defaults to false. if true, you can start the same script several times which is usually not allowed by PM2


  // Deployment
  // key               SSH key path String $HOME/.ssh
  // user              SSH user String
  // host              SSH host [String]
  // ssh_options       SSH options with no command-line flag, see ‘man ssh’ String or [String]
  // ref               GIT remote/branch String
  // repo              GIT remote String
  // path              path in the server String
  // pre-setup         Pre-setup command or path to a script on your local machine String
  // post-setup        Post-setup commands or path to a script on the host machine String
  // pre-deploy-local  pre-deploy action String
  // post-deploy       post-deploy action String

};
