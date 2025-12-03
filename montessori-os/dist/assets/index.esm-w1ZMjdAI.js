import{r as b,_ as T,C as v,a as k,E as W,o as Te,F as Y,g as ve,b as E,L as Ae,i as J,c as X,d as Q,v as Z,e as Se,f as L}from"./index-C5v96E8F.js";const ee="@firebase/installations",M="0.6.18";/**
 * @license
 * Copyright 2019 Google LLC
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
 */const te=1e4,ne=`w:${M}`,ie="FIS_v2",ke="https://firebaseinstallations.googleapis.com/v1",Ee=3600*1e3,Ce="installations",Re="Installations";/**
 * @license
 * Copyright 2019 Google LLC
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
 */const Pe={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},w=new W(Ce,Re,Pe);function ae(e){return e instanceof Y&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
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
 */function re({projectId:e}){return`${ke}/projects/${e}/installations`}function se(e){return{token:e.token,requestStatus:2,expiresIn:Oe(e.expiresIn),creationTime:Date.now()}}async function oe(e,t){const i=(await t.json()).error;return w.create("request-failed",{requestName:e,serverCode:i.code,serverMessage:i.message,serverStatus:i.status})}function ce({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function _e(e,{refreshToken:t}){const n=ce(e);return n.append("Authorization",De(t)),n}async function le(e){const t=await e();return t.status>=500&&t.status<600?e():t}function Oe(e){return Number(e.replace("s","000"))}function De(e){return`${ie} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
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
 */async function Fe({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const i=re(e),a=ce(e),r=t.getImmediate({optional:!0});if(r){const l=await r.getHeartbeatsHeader();l&&a.append("x-firebase-client",l)}const s={fid:n,authVersion:ie,appId:e.appId,sdkVersion:ne},o={method:"POST",headers:a,body:JSON.stringify(s)},c=await le(()=>fetch(i,o));if(c.ok){const l=await c.json();return{fid:l.fid||n,registrationStatus:2,refreshToken:l.refreshToken,authToken:se(l.authToken)}}else throw await oe("Create Installation",c)}/**
 * @license
 * Copyright 2019 Google LLC
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
 */function ue(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
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
 */function Me(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
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
 */const $e=/^[cdef][\w-]{21}$/,F="";function Ne(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=je(e);return $e.test(n)?n:F}catch{return F}}function je(e){return Me(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
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
 */function C(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
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
 */const de=new Map;function fe(e,t){const n=C(e);pe(n,t),xe(n,t)}function pe(e,t){const n=de.get(e);if(n)for(const i of n)i(t)}function xe(e,t){const n=Le();n&&n.postMessage({key:e,fid:t}),qe()}let h=null;function Le(){return!h&&"BroadcastChannel"in self&&(h=new BroadcastChannel("[Firebase] FID Change"),h.onmessage=e=>{pe(e.data.key,e.data.fid)}),h}function qe(){de.size===0&&h&&(h.close(),h=null)}/**
 * @license
 * Copyright 2019 Google LLC
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
 */const Be="firebase-installations-database",Ue=1,I="firebase-installations-store";let _=null;function $(){return _||(_=Te(Be,Ue,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(I)}}})),_}async function A(e,t){const n=C(e),a=(await $()).transaction(I,"readwrite"),r=a.objectStore(I),s=await r.get(n);return await r.put(t,n),await a.done,(!s||s.fid!==t.fid)&&fe(e,t.fid),t}async function ge(e){const t=C(e),i=(await $()).transaction(I,"readwrite");await i.objectStore(I).delete(t),await i.done}async function R(e,t){const n=C(e),a=(await $()).transaction(I,"readwrite"),r=a.objectStore(I),s=await r.get(n),o=t(s);return o===void 0?await r.delete(n):await r.put(o,n),await a.done,o&&(!s||s.fid!==o.fid)&&fe(e,o.fid),o}/**
 * @license
 * Copyright 2019 Google LLC
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
 */async function N(e){let t;const n=await R(e.appConfig,i=>{const a=Ve(i),r=ze(e,a);return t=r.registrationPromise,r.installationEntry});return n.fid===F?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function Ve(e){const t=e||{fid:Ne(),registrationStatus:0};return he(t)}function ze(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const a=Promise.reject(w.create("app-offline"));return{installationEntry:t,registrationPromise:a}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},i=Ge(e,n);return{installationEntry:n,registrationPromise:i}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:He(e)}:{installationEntry:t}}async function Ge(e,t){try{const n=await Fe(e,t);return A(e.appConfig,n)}catch(n){throw ae(n)&&n.customData.serverCode===409?await ge(e.appConfig):await A(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function He(e){let t=await q(e.appConfig);for(;t.registrationStatus===1;)await ue(100),t=await q(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:i}=await N(e);return i||n}return t}function q(e){return R(e,t=>{if(!t)throw w.create("installation-not-found");return he(t)})}function he(e){return Ke(e)?{fid:e.fid,registrationStatus:0}:e}function Ke(e){return e.registrationStatus===1&&e.registrationTime+te<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
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
 */async function We({appConfig:e,heartbeatServiceProvider:t},n){const i=Ye(e,n),a=_e(e,n),r=t.getImmediate({optional:!0});if(r){const l=await r.getHeartbeatsHeader();l&&a.append("x-firebase-client",l)}const s={installation:{sdkVersion:ne,appId:e.appId}},o={method:"POST",headers:a,body:JSON.stringify(s)},c=await le(()=>fetch(i,o));if(c.ok){const l=await c.json();return se(l)}else throw await oe("Generate Auth Token",c)}function Ye(e,{fid:t}){return`${re(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
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
 */async function j(e,t=!1){let n;const i=await R(e.appConfig,r=>{if(!me(r))throw w.create("not-registered");const s=r.authToken;if(!t&&Qe(s))return r;if(s.requestStatus===1)return n=Je(e,t),r;{if(!navigator.onLine)throw w.create("app-offline");const o=et(r);return n=Xe(e,o),o}});return n?await n:i.authToken}async function Je(e,t){let n=await B(e.appConfig);for(;n.authToken.requestStatus===1;)await ue(100),n=await B(e.appConfig);const i=n.authToken;return i.requestStatus===0?j(e,t):i}function B(e){return R(e,t=>{if(!me(t))throw w.create("not-registered");const n=t.authToken;return tt(n)?Object.assign(Object.assign({},t),{authToken:{requestStatus:0}}):t})}async function Xe(e,t){try{const n=await We(e,t),i=Object.assign(Object.assign({},t),{authToken:n});return await A(e.appConfig,i),n}catch(n){if(ae(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await ge(e.appConfig);else{const i=Object.assign(Object.assign({},t),{authToken:{requestStatus:0}});await A(e.appConfig,i)}throw n}}function me(e){return e!==void 0&&e.registrationStatus===2}function Qe(e){return e.requestStatus===2&&!Ze(e)}function Ze(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+Ee}function et(e){const t={requestStatus:1,requestTime:Date.now()};return Object.assign(Object.assign({},e),{authToken:t})}function tt(e){return e.requestStatus===1&&e.requestTime+te<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
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
 */async function nt(e){const t=e,{installationEntry:n,registrationPromise:i}=await N(t);return i?i.catch(console.error):j(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
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
 */async function it(e,t=!1){const n=e;return await at(n),(await j(n,t)).token}async function at(e){const{registrationPromise:t}=await N(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
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
 */function rt(e){if(!e||!e.options)throw O("App Configuration");if(!e.name)throw O("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw O(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function O(e){return w.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
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
 */const we="installations",st="installations-internal",ot=e=>{const t=e.getProvider("app").getImmediate(),n=rt(t),i=k(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:i,_delete:()=>Promise.resolve()}},ct=e=>{const t=e.getProvider("app").getImmediate(),n=k(t,we).getImmediate();return{getId:()=>nt(n),getToken:a=>it(n,a)}};function lt(){T(new v(we,ot,"PUBLIC")),T(new v(st,ct,"PRIVATE"))}lt();b(ee,M);b(ee,M,"esm2017");/**
 * @license
 * Copyright 2019 Google LLC
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
 */const S="analytics",ut="firebase_id",dt="origin",ft=60*1e3,pt="https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig",x="https://www.googletagmanager.com/gtag/js";/**
 * @license
 * Copyright 2019 Google LLC
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
 */const u=new Ae("@firebase/analytics");/**
 * @license
 * Copyright 2019 Google LLC
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
 */const gt={"already-exists":"A Firebase Analytics instance with the appId {$id}  already exists. Only one Firebase Analytics instance can be created for each appId.","already-initialized":"initializeAnalytics() cannot be called again with different options than those it was initially called with. It can be called again with the same options to return the existing instance, or getAnalytics() can be used to get a reference to the already-initialized instance.","already-initialized-settings":"Firebase Analytics has already been initialized.settings() must be called before initializing any Analytics instanceor it will have no effect.","interop-component-reg-failed":"Firebase Analytics Interop Component failed to instantiate: {$reason}","invalid-analytics-context":"Firebase Analytics is not supported in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","indexeddb-unavailable":"IndexedDB unavailable or restricted in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","fetch-throttle":"The config fetch request timed out while in an exponential backoff state. Unix timestamp in milliseconds when fetch request throttling ends: {$throttleEndTimeMillis}.","config-fetch-failed":"Dynamic config fetch failed: [{$httpStatus}] {$responseMessage}","no-api-key":'The "apiKey" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid API key.',"no-app-id":'The "appId" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid app ID.',"no-client-id":'The "client_id" field is empty.',"invalid-gtag-resource":"Trusted Types detected an invalid gtag resource: {$gtagURL}."},d=new W("analytics","Analytics",gt);/**
 * @license
 * Copyright 2019 Google LLC
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
 */function ht(e){if(!e.startsWith(x)){const t=d.create("invalid-gtag-resource",{gtagURL:e});return u.warn(t.message),""}return e}function Ie(e){return Promise.all(e.map(t=>t.catch(n=>n)))}function mt(e,t){let n;return window.trustedTypes&&(n=window.trustedTypes.createPolicy(e,t)),n}function wt(e,t){const n=mt("firebase-js-sdk-policy",{createScriptURL:ht}),i=document.createElement("script"),a=`${x}?l=${e}&id=${t}`;i.src=n?n==null?void 0:n.createScriptURL(a):a,i.async=!0,document.head.appendChild(i)}function It(e){let t=[];return Array.isArray(window[e])?t=window[e]:window[e]=t,t}async function yt(e,t,n,i,a,r){const s=i[a];try{if(s)await t[s];else{const c=(await Ie(n)).find(l=>l.measurementId===a);c&&await t[c.appId]}}catch(o){u.error(o)}e("config",a,r)}async function bt(e,t,n,i,a){try{let r=[];if(a&&a.send_to){let s=a.send_to;Array.isArray(s)||(s=[s]);const o=await Ie(n);for(const c of s){const l=o.find(g=>g.measurementId===c),f=l&&t[l.appId];if(f)r.push(f);else{r=[];break}}}r.length===0&&(r=Object.values(t)),await Promise.all(r),e("event",i,a||{})}catch(r){u.error(r)}}function Tt(e,t,n,i){async function a(r,...s){try{if(r==="event"){const[o,c]=s;await bt(e,t,n,o,c)}else if(r==="config"){const[o,c]=s;await yt(e,t,n,i,o,c)}else if(r==="consent"){const[o,c]=s;e("consent",o,c)}else if(r==="get"){const[o,c,l]=s;e("get",o,c,l)}else if(r==="set"){const[o]=s;e("set",o)}else e(r,...s)}catch(o){u.error(o)}}return a}function vt(e,t,n,i,a){let r=function(...s){window[i].push(arguments)};return window[a]&&typeof window[a]=="function"&&(r=window[a]),window[a]=Tt(r,e,t,n),{gtagCore:r,wrappedGtag:window[a]}}function At(e){const t=window.document.getElementsByTagName("script");for(const n of Object.values(t))if(n.src&&n.src.includes(x)&&n.src.includes(e))return n;return null}/**
 * @license
 * Copyright 2020 Google LLC
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
 */const St=30,kt=1e3;class Et{constructor(t={},n=kt){this.throttleMetadata=t,this.intervalMillis=n}getThrottleMetadata(t){return this.throttleMetadata[t]}setThrottleMetadata(t,n){this.throttleMetadata[t]=n}deleteThrottleMetadata(t){delete this.throttleMetadata[t]}}const ye=new Et;function Ct(e){return new Headers({Accept:"application/json","x-goog-api-key":e})}async function Rt(e){var t;const{appId:n,apiKey:i}=e,a={method:"GET",headers:Ct(i)},r=pt.replace("{app-id}",n),s=await fetch(r,a);if(s.status!==200&&s.status!==304){let o="";try{const c=await s.json();!((t=c.error)===null||t===void 0)&&t.message&&(o=c.error.message)}catch{}throw d.create("config-fetch-failed",{httpStatus:s.status,responseMessage:o})}return s.json()}async function Pt(e,t=ye,n){const{appId:i,apiKey:a,measurementId:r}=e.options;if(!i)throw d.create("no-app-id");if(!a){if(r)return{measurementId:r,appId:i};throw d.create("no-api-key")}const s=t.getThrottleMetadata(i)||{backoffCount:0,throttleEndTimeMillis:Date.now()},o=new Dt;return setTimeout(async()=>{o.abort()},ft),be({appId:i,apiKey:a,measurementId:r},s,o,t)}async function be(e,{throttleEndTimeMillis:t,backoffCount:n},i,a=ye){var r;const{appId:s,measurementId:o}=e;try{await _t(i,t)}catch(c){if(o)return u.warn(`Timed out fetching this Firebase app's measurement ID from the server. Falling back to the measurement ID ${o} provided in the "measurementId" field in the local Firebase config. [${c==null?void 0:c.message}]`),{appId:s,measurementId:o};throw c}try{const c=await Rt(e);return a.deleteThrottleMetadata(s),c}catch(c){const l=c;if(!Ot(l)){if(a.deleteThrottleMetadata(s),o)return u.warn(`Failed to fetch this Firebase app's measurement ID from the server. Falling back to the measurement ID ${o} provided in the "measurementId" field in the local Firebase config. [${l==null?void 0:l.message}]`),{appId:s,measurementId:o};throw c}const f=Number((r=l==null?void 0:l.customData)===null||r===void 0?void 0:r.httpStatus)===503?L(n,a.intervalMillis,St):L(n,a.intervalMillis),g={throttleEndTimeMillis:Date.now()+f,backoffCount:n+1};return a.setThrottleMetadata(s,g),u.debug(`Calling attemptFetch again in ${f} millis`),be(e,g,i,a)}}function _t(e,t){return new Promise((n,i)=>{const a=Math.max(t-Date.now(),0),r=setTimeout(n,a);e.addEventListener(()=>{clearTimeout(r),i(d.create("fetch-throttle",{throttleEndTimeMillis:t}))})})}function Ot(e){if(!(e instanceof Y)||!e.customData)return!1;const t=Number(e.customData.httpStatus);return t===429||t===500||t===503||t===504}class Dt{constructor(){this.listeners=[]}addEventListener(t){this.listeners.push(t)}abort(){this.listeners.forEach(t=>t())}}async function Ft(e,t,n,i,a){if(a&&a.global){e("event",n,i);return}else{const r=await t,s=Object.assign(Object.assign({},i),{send_to:r});e("event",n,s)}}async function Mt(e,t,n,i){if(i&&i.global)return e("set",{user_id:n}),Promise.resolve();{const a=await t;e("config",a,{update:!0,user_id:n})}}async function $t(e,t,n,i){if(i&&i.global){const a={};for(const r of Object.keys(n))a[`user_properties.${r}`]=n[r];return e("set",a),Promise.resolve()}else{const a=await t;e("config",a,{update:!0,user_properties:n})}}/**
 * @license
 * Copyright 2020 Google LLC
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
 */async function Nt(){if(Q())try{await Z()}catch(e){return u.warn(d.create("indexeddb-unavailable",{errorInfo:e==null?void 0:e.toString()}).message),!1}else return u.warn(d.create("indexeddb-unavailable",{errorInfo:"IndexedDB is not available in this environment."}).message),!1;return!0}async function jt(e,t,n,i,a,r,s){var o;const c=Pt(e);c.then(p=>{n[p.measurementId]=p.appId,e.options.measurementId&&p.measurementId!==e.options.measurementId&&u.warn(`The measurement ID in the local Firebase config (${e.options.measurementId}) does not match the measurement ID fetched from the server (${p.measurementId}). To ensure analytics events are always sent to the correct Analytics property, update the measurement ID field in the local config or remove it from the local config.`)}).catch(p=>u.error(p)),t.push(c);const l=Nt().then(p=>{if(p)return i.getId()}),[f,g]=await Promise.all([c,l]);At(r)||wt(r,f.measurementId),a("js",new Date);const y=(o=s==null?void 0:s.config)!==null&&o!==void 0?o:{};return y[dt]="firebase",y.update=!0,g!=null&&(y[ut]=g),a("config",f.measurementId,y),f.measurementId}/**
 * @license
 * Copyright 2019 Google LLC
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
 */class xt{constructor(t){this.app=t}_delete(){return delete m[this.app.options.appId],Promise.resolve()}}let m={},U=[];const V={};let D="dataLayer",Lt="gtag",z,P,G=!1;function qt(){const e=[];if(J()&&e.push("This is a browser extension environment."),X()||e.push("Cookies are not available."),e.length>0){const t=e.map((i,a)=>`(${a+1}) ${i}`).join(" "),n=d.create("invalid-analytics-context",{errorInfo:t});u.warn(n.message)}}function Bt(e,t,n){qt();const i=e.options.appId;if(!i)throw d.create("no-app-id");if(!e.options.apiKey)if(e.options.measurementId)u.warn(`The "apiKey" field is empty in the local Firebase config. This is needed to fetch the latest measurement ID for this Firebase app. Falling back to the measurement ID ${e.options.measurementId} provided in the "measurementId" field in the local Firebase config.`);else throw d.create("no-api-key");if(m[i]!=null)throw d.create("already-exists",{id:i});if(!G){It(D);const{wrappedGtag:r,gtagCore:s}=vt(m,U,V,D,Lt);P=r,z=s,G=!0}return m[i]=jt(e,U,V,t,z,D,n),new xt(e)}function Ht(e=ve()){e=E(e);const t=k(e,S);return t.isInitialized()?t.getImmediate():Ut(e)}function Ut(e,t={}){const n=k(e,S);if(n.isInitialized()){const a=n.getImmediate();if(Se(t,n.getOptions()))return a;throw d.create("already-initialized")}return n.initialize({options:t})}async function Kt(){if(J()||!X()||!Q())return!1;try{return await Z()}catch{return!1}}function Wt(e,t,n){e=E(e),Mt(P,m[e.app.options.appId],t,n).catch(i=>u.error(i))}function Yt(e,t,n){e=E(e),$t(P,m[e.app.options.appId],t,n).catch(i=>u.error(i))}function Vt(e,t,n,i){e=E(e),Ft(P,m[e.app.options.appId],t,n,i).catch(a=>u.error(a))}const H="@firebase/analytics",K="0.10.17";function zt(){T(new v(S,(t,{options:n})=>{const i=t.getProvider("app").getImmediate(),a=t.getProvider("installations-internal").getImmediate();return Bt(i,a,n)},"PUBLIC")),T(new v("analytics-internal",e,"PRIVATE")),b(H,K),b(H,K,"esm2017");function e(t){try{const n=t.getProvider(S).getImmediate();return{logEvent:(i,a,r)=>Vt(n,i,a,r)}}catch(n){throw d.create("interop-component-reg-failed",{reason:n})}}}zt();export{Ht as getAnalytics,Ut as initializeAnalytics,Kt as isSupported,Vt as logEvent,Wt as setUserId,Yt as setUserProperties};
//# sourceMappingURL=index.esm-w1ZMjdAI.js.map
