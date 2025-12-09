import http from 'k6/http';
import { randomIntBetween, randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8000';
const virtualUsers = Number(__ENV.VUS || 5);
const durationSeconds = resolveDurationSeconds(__ENV.DURATION || '1m');
const rampSeconds = Math.max(1, Math.round(durationSeconds / 10));
const cloudProjectId = Number(__ENV.CLOUD_PROJECT_ID || 6019612);

export const options = {
    stages: [
        { duration: `${rampSeconds}s`, target: virtualUsers },
        { duration: `${durationSeconds}s`, target: virtualUsers },
        { duration: `${rampSeconds}s`, target: 0 }
    ],
    cloud: {
        projectID: cloudProjectId,
    },
    thresholds: {
        http_req_duration: ['p(90)<1200', 'p(95)<1500'],
        checks: ['rate>=0.99']
    }
};

export function setup() {
    console.log('Checking if service is available...');
    const res = http.get(baseUrl);
    if (res.status !== 200) {
        exec.test.abort('Service is not available');
    }
    console.log('Service is available');
}

export default function () {
    const userCredentials = {
        username: 'test_' + randomString(10),
        password: 'secret_' + randomString(10),
    };

    const endpoints = {
        register: baseUrl + '/user/register/',
        login: baseUrl + '/auth/token/login/',
        crocodiles: baseUrl + '/my/crocodiles/'
    };

    const jsonHeaders = { 'Content-Type': 'application/json' };

    // 1. Register user
    const registerStep = 'RegisterUser';
    let res = http.post(
        endpoints.register,
        JSON.stringify(userCredentials),
        { headers: jsonHeaders, tags: { name: registerStep } }
    );

    check(res, {
        [`${registerStep} | status 201`]: (r) => r.status === 201,
        [`${registerStep} | username matches`]: (r) => r.json().username === userCredentials.username
    });

    sleep(randomIntBetween(0, 5));

    // 2. Login and get token
    const loginStep = 'LoginUser';
    const response = http.post(
        endpoints.login,
        JSON.stringify(userCredentials),
        { headers: jsonHeaders, tags: { name: loginStep } }
    );

    let accessToken = '';
    if (response.status === 200) {
        accessToken = response.json().access;
    }

    check(response, {
        [`${loginStep} | status 200`]: (r) => r.status === 200,
        [`${loginStep} | token received`]: () => !!accessToken
    });

    if (!accessToken) {
        return;
    }

    sleep(randomIntBetween(0, 5));

    const authHeaders = { Authorization: 'Bearer ' + accessToken };
    const authJsonHeaders = { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };

    // 3. Get list of crocodiles
    const listStep = 'GetMyCrocodiles';
    res = http.get(
        endpoints.crocodiles,
        { headers: authHeaders, tags: { name: listStep } }
    );

    check(res, {
        [`${listStep} | status 200`]: (r) => r.status === 200,
        [`${listStep} | empty list`]: (r) => r.json().length === 0
    });

    sleep(randomIntBetween(0, 5));

    // 4. Create new crocodile
    const createStep = 'AddCrocodile';
    res = http.post(
        endpoints.crocodiles,
        JSON.stringify({ name: 'Oleh', sex: 'M', date_of_birth: '2010-05-15' }),
        { headers: authJsonHeaders, tags: { name: createStep } }
    );

    check(res, {
        [`${createStep} | status 201`]: (r) => r.status === 201,
        [`${createStep} | id issued`]: (r) => r.json().id !== null
    });

    if (newCrocodileId === null) {
        return;
    }

    sleep(randomIntBetween(0, 5));

    // 5. Get specific crocodile
    const detailStep = 'GetCrocodile';
    res = http.get(
        `${endpoints.crocodiles}${newCrocodileId}/`,
        { headers: authHeaders, tags: { name: detailStep } }
    );

    check(res, {
        [`${detailStep} | status 200`]: (r) => r.status === 200,
        [`${detailStep} | correct id`]: (r) => r.json().id === newCrocodileId
    });

    sleep(randomIntBetween(0, 5));

    // 6. Update crocodile info with PUT
    const putStep = 'PutCrocodile';
    res = http.put(
        `${endpoints.crocodiles}${newCrocodileId}/`,
        JSON.stringify({ name: 'Anzhella', sex: 'M', date_of_birth: '1900-10-28' }),
        { headers: authJsonHeaders, tags: { name: putStep } }
    );

    check(res, {
        [`${putStep} | status 200`]: (r) => r.status === 200,
        [`${putStep} | name updated`]: (r) => r.json().name === 'Anzhella'
    });

    sleep(randomIntBetween(0, 5));

    // 7. Partially update crocodile info with PATCH
    const patchStep = 'PatchCrocodile';
    res = http.patch(
        `${endpoints.crocodiles}${newCrocodileId}/`,
        JSON.stringify({ sex: 'F' }),
        { headers: authJsonHeaders, tags: { name: patchStep } }
    );

    check(res, {
        [`${patchStep} | status 200`]: (r) => r.status === 200,
        [`${patchStep} | gender updated`]: (r) => r.json().sex === 'F'
    });

    sleep(randomIntBetween(0, 5));

    // 8. Delete crocodile
    const deleteStep = 'DeleteCrocodile';
    res = http.del(
        `${endpoints.crocodiles}${newCrocodileId}/`,
        null,
        { headers: authHeaders, tags: { name: deleteStep } }
    );

    check(res, {
        [`${deleteStep} | status 204/200`]: (r) => r.status === 204 || r.status === 200
    });

    sleep(randomIntBetween(0, 5));
};

export function teardown() {
    console.log('🏁 Test execution completed');
}

function resolveDurationSeconds(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d+)([smh]?)$/i);
    if (!match) {
        return Number(raw) || 60;
    }
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'm') {
        return amount * 60;
    }
    if (unit === 'h') {
        return amount * 3600;
    }
    return amount;
}

// Run - K6_WEB_DASHBOARD=true k6 run fulle2etest.js -e BASE_URL=http://localhost:8000 -e VUS=10 -e DURATION=2m