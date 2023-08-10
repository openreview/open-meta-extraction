/*
 * Interface to communicate with OpenReview
 */

import _ from 'lodash';
import axios, {
  AxiosRequestConfig,
  AxiosInstance,
  AxiosError
} from 'axios';


import {
  getServiceLogger,
  initConfig,
  putStrLn
} from '@watr/commonlib';

import { Logger } from 'winston';
import { ClientRequest } from 'http';

type ErrorTypes = AxiosError | unknown;

export interface User {
  id: string;
}

export interface Credentials {
  token: string;
  user: User;
}

export class OpenReviewExchange {
  credentials?: Credentials;
  user: string;
  password: string;
  apiBaseURL: string;
  log: Logger;

  constructor() {
    const config = initConfig();
    this.log = getServiceLogger('OpenReviewExchange');
    const restApi = config.get('openreview:restApi');
    const port = config.get('openreview:port');
    this.apiBaseURL = `${restApi}:${port}`;

    this.user = config.get('openreview:restUser');
    this.password = config.get('openreview:restPassword');
  }


  configRequest(): AxiosRequestConfig {
    let auth = {};
    if (this.credentials) {
      auth = {
        Authorization: `Bearer ${this.credentials.token}`
      };
    }

    const reqconfig: AxiosRequestConfig = {
      baseURL: this.apiBaseURL,
      headers: {
        'User-Agent': 'open-extraction-service',
        ...auth
      },
      timeout: 60_000,
      responseType: 'json'
    };

    return reqconfig;
  }

  configAxios(): AxiosInstance {
    const conf = this.configRequest();
    return axios.create(conf);
  }

  async getCredentials(): Promise<Credentials> {
    if (this.credentials !== undefined) {
      return this.credentials;
    }

    this.log.info(`Logging in as ${this.user}`);

    if (this.user === undefined || this.password === undefined) {
      throw new Error('Openreview API: user or password not defined');
    }
    const creds = await this.postLogin();

    this.log.info(`Logged in as ${creds.user.id}`);

    this.credentials = creds;
    return creds;
  }

  async postLogin(): Promise<Credentials> {
    return this.configAxios()
      .post('/login', { id: this.user, password: this.password })
      .then(r => r.data)
      .catch(error => displayRestError(error));
  }

  async apiGET<R>(url: string, query: Record<string, string | number>): Promise<R | undefined> {
    const run = async () => {
      const start = Date.now();
      return this.configAxios()
        .get(url, { params: query })
        .then(response => {
          const end = Date.now();
          const totalTime = end - start;
          this.log.debug(`perf: ${totalTime}ms - GET ${url}`);
          return response.data;
        });
    };

    return this.apiAttempt(run);
  }

  async apiPOST<PD extends object, R>(url: string, postData: PD): Promise<R | undefined> {
    const run = async () => {
      const start = Date.now();
      return this.configAxios()
        .post(url, postData)
        .then(response => {
          const end = Date.now();
          const totalTime = end - start;
          this.log.debug(`perf: ${totalTime}ms - POST ${url}`);
          return response.data;
        }).catch((error: Error) => {
          this.log.error(`POST error: ${error.name}: ${error.message}`);
        });
    };

    return this.apiAttempt(run);
  }

  async apiAttempt<R>(apiCall: () => Promise<R>, attemptNumber: number = 0): Promise<R | undefined> {
    if (attemptNumber == 1) {
      this.credentials = undefined;
      await this.getCredentials()
        .catch((error: Error) => {
          this.log.error(`login retry: getCredentials error: ${error.name}: ${error.message}`);
          throw error;
        });
    }
    if (attemptNumber > 1) {
      throw new Error('Could not login to OpenReview server');
    }

    await this.getCredentials()
      .catch((error: Error) => {
        this.log.error(`getCredentials error: ${error.name}: ${error.message}`);
      });
    return apiCall()
      .catch(error => {
        displayRestError(error);
        this.credentials = undefined;
        this.log.warn(`API Error ${error}: attempt#=${attemptNumber} `);
        return this.apiAttempt(apiCall, attemptNumber + 1);
      });
  }
}


function isAxiosError(error: any): error is AxiosError {
  return error.isAxiosError !== undefined && error.isAxiosError;
}

export function displayRestError(error: ErrorTypes): void {
  if (isAxiosError(error)) {
    const { request, response, message } = error;
    const errorList: string[] = [];
    errorList.push(`HTTP Request Error: ${message}`);
    if (request) {
      const req: ClientRequest = request;
      const { path } = req;
      errorList.push(`Request: path=${path}`);
    }
    if (response) {
      const { status, statusText } = response;
      errorList.push(`Response: ${message}: response=${status}/${statusText}`);
    }
    putStrLn(errorList.join('\n'));
    return;
  }

  console.log(error);
}
