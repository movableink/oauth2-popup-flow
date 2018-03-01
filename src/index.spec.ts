export interface OAuth2WindowDotOpenOptions {
  authorizationUrl: string,
  clientId: string,
  redirectUri: string,
  scope: string,
  responseType?: string,
  accessTokenStorageKey?: string,
  accessTokenResponseKey?: string,
  storage?: Storage,
  pollingTime?: number,
}

export class OAuth2WindowDotOpen<TokenPayload extends { exp: number }> {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  responseType: string;
  accessTokenStorageKey: string;
  accessTokenResponseKey: string;
  storage: Storage;
  pollingTime: number;

  constructor(options: OAuth2WindowDotOpenOptions) {
    this.authorizationUrl = options.authorizationUrl;
    this.clientId = options.clientId;
    this.redirectUri = options.redirectUri;
    this.scope = options.scope;
    this.responseType = options.responseType || 'token';
    this.accessTokenStorageKey = options.accessTokenStorageKey || 'token';
    this.accessTokenResponseKey = options.accessTokenResponseKey || 'access_token';
    this.storage = options.storage || localStorage;
    this.pollingTime = options.pollingTime || 200;
  }

  private get _rawToken() {
    return this.storage.getItem(this.accessTokenStorageKey) || undefined;
  }
  private set _rawToken(value: string | undefined) {
    if (value === null) { return; }
    if (value === undefined) { return; }
    this.storage.setItem(this.accessTokenStorageKey, value);
  }

  private get _rawTokenPayload() {
    const rawToken = this._rawToken;
    if (!rawToken) { return undefined; }

    const tokenSplit = rawToken.split('.');
    const encodedPayload = tokenSplit[1];
    if (!encodedPayload) { return undefined; }

    const decodedPayloadJson = atob(encodedPayload);
    const decodedPayload = OAuth2WindowDotOpen.jsonParseOrUndefined<TokenPayload>(
      decodedPayloadJson
    );
    return decodedPayload;
  }

  tryLoginPopup() {
    if (this.loggedIn()) { return true; }

    const popup = open(`${this.authorizationUrl}?${OAuth2WindowDotOpen.encodeObjectToUri({
      client_id: this.clientId,
      response_type: this.responseType,
      redirect_uri: this.redirectUri,
      scope: this.scope,
    })}`);
    if (!popup) { return false; }

    popup.close();
    return true;
  }

  loggedIn() {
    const decodedPayload = this._rawTokenPayload;
    if (!decodedPayload) { return false; }

    const exp = decodedPayload.exp;
    if (!exp) { return false; }

    if (new Date().getTime() > exp * 1000) { return false; }

    return true;
  }

  handleRedirect() {
    const locationHref = location.href;
    if (!locationHref.startsWith(this.redirectUri)) { return false; }
    const rawHash = location.hash;
    if (!rawHash) { return false; }
    const hashMatch = /#(.*)/.exec(rawHash);
    if (!hashMatch) { return false; }
    const hash = hashMatch[1];

    const authorizationResponse = OAuth2WindowDotOpen.decodeUriToObject(hash);
    const rawToken = authorizationResponse[this.accessTokenResponseKey];
    if (!rawToken) { return false; }
    this._rawToken = rawToken;
    return true;
  }

  async authenticated() {
    while (!this.loggedIn()) {
      await OAuth2WindowDotOpen.time(this.pollingTime);
    }
  }

  async token() {
    if (!this.loggedIn()) {
      this.tryLoginPopup();
      await this.authenticated();
    }
    const token = this._rawToken;
    if (!token) {
      throw new Error('Token was falsy after being authenticated.');
    }
    return token;
  }

  async tokenPayload() {
    if (!this.loggedIn()) {
      this.tryLoginPopup();
      await this.authenticated();
    }
    const payload = this._rawTokenPayload;
    if (!payload) {
      throw new Error('Token payload was falsy after being authenticated.');
    }
    return payload;
  }

  static jsonParseOrUndefined<T = {}>(json: string) {
    try {
      return JSON.parse(json) as T;
    } catch {
      return undefined;
    }
  }

  static time(milliseconds: number) {
    return new Promise<'TIMER'>(resolve => setTimeout(() => resolve('TIMER')));
  }

  /**
   * wraps `decodeURIComponent` and returns the original string if it cannot be decoded
   */
  static decodeUri(str: string) {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  static encodeObjectToUri(obj: { [key: string]: string }) {
    return (Object
      .keys(obj)
      .map(key => ({ key, value: obj[key] }))
      .map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    );
  }

  static decodeUriToObject(str: string) {
    return str.split('&').reduce((decoded, keyValuePair) => {
      const [keyEncoded, valueEncoded] = keyValuePair.split('=');
      const key = this.decodeUri(keyEncoded);
      const value = this.decodeUri(valueEncoded);
      decoded[key] = value;
      return decoded;
    }, {} as { [key: string]: string | undefined });
  }
}