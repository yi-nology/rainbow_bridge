import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    errors: ['rate<0.1'],              // Error rate should be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const BASE_PATH = __ENV.BASE_PATH || '';
const API_BASE = `${BASE_URL}${BASE_PATH}/api/v1`;

export default function() {
  group('Environment APIs', function() {
    // List environments
    let res = http.get(`${API_BASE}/environment/list`);
    check(res, {
      'status is 200': (r) => r.status === 200,
      'response has code': (r) => r.json('code') !== undefined,
    }) || errorRate.add(1);
    sleep(1);
  });

  group('Config APIs', function() {
    // List configs (requires environment and pipeline)
    const params = {
      environment_key: 'dev',
      pipeline_key: 'main',
    };
    
    let res = http.get(`${API_BASE}/config/list?${new URLSearchParams(params)}`);
    check(res, {
      'status is 200': (r) => r.status === 200,
      'has config list': (r) => r.json('data.list') !== undefined,
    }) || errorRate.add(1);
    sleep(1);
  });

  group('Runtime Config APIs', function() {
    const headers = {
      'x-environment': 'dev',
      'x-pipeline': 'main',
    };
    
    let res = http.get(`${API_BASE}/runtime/config`, { headers });
    check(res, {
      'status is 200': (r) => r.status === 200,
      'has configs': (r) => r.json('data.configs') !== undefined,
    }) || errorRate.add(1);
    sleep(1);
  });

  group('Version API', function() {
    let res = http.get(`${API_BASE}/version`);
    check(res, {
      'status is 200': (r) => r.status === 200,
      'has version info': (r) => r.json('data') !== undefined,
    }) || errorRate.add(1);
    sleep(1);
  });
}

export function handleSummary(data) {
  return {
    'reports/summary.json': JSON.stringify(data),
    'reports/summary.html': htmlReport(data),
  };
}

function htmlReport(data) {
  const results = data.metrics;
  
  // 安全获取嵌套属性的辅助函数
  const safeGet = (obj, path, defaultValue = 'N/A') => {
    try {
      const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
      return value !== undefined && value !== null ? value : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };
  
  const formatNumber = (value, decimals = 2) => {
    if (typeof value === 'number') {
      return value.toFixed(decimals);
    }
    return value;
  };
  
  // 获取指标值
  const p95Duration = formatNumber(safeGet(results, "http_req_duration.values.p(95)"));
  const avgDuration = formatNumber(safeGet(results, "http_req_duration.values.avg"));
  const totalRequests = safeGet(results, "http_reqs.values.count", 0);
  const requestRate = formatNumber(safeGet(results, "http_reqs.values.rate"));
  const errorRate = safeGet(results, "errors.values.rate", 0);
  const errorRatePercent = formatNumber(errorRate * 100);
  const errorClass = errorRate < 0.1 ? 'pass' : 'fail';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Rainbow Bridge Performance Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .pass { color: green; font-weight: bold; }
    .fail { color: red; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Performance Test Report</h1>
  <p>Test Date: ${new Date().toISOString()}</p>
  
  <h2>Key Metrics</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>HTTP Request Duration (p95)</td>
      <td>${p95Duration} ms</td>
    </tr>
    <tr>
      <td>HTTP Request Duration (avg)</td>
      <td>${avgDuration} ms</td>
    </tr>
    <tr>
      <td>HTTP Requests Total</td>
      <td>${totalRequests}</td>
    </tr>
    <tr>
      <td>HTTP Request Rate</td>
      <td>${requestRate} req/s</td>
    </tr>
    <tr>
      <td>Error Rate</td>
      <td class="${errorClass}">
        ${errorRatePercent}%
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
