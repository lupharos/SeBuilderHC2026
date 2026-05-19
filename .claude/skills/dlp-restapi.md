# Forcepoint DLP REST API — Complete Reference

> **Version:** 10.4.0  
> **Base URL:** `https://<DLP_MANAGER_IP>:<DLP_MANAGER_PORT>/dlp/rest/v1`  
> **Auth:** JWT (Bearer token)  
> **Protocol:** HTTPS only

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Incident Management APIs](#2-incident-management-apis)
3. [Policy Management APIs](#3-policy-management-apis)
4. [Deploy APIs](#4-deploy-apis)
5. [Shared Object Schemas](#5-shared-object-schemas)
6. [Status & Error Codes Reference](#6-status--error-codes-reference)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Authentication

Authentication is a two-step JWT flow: first get a **refresh token**, then use it to get an **access token**.

> ⚠️ Only **Application Administrator** accounts can request tokens. User Administrator type returns `403`.

---

### 1.1 Get Refresh Token

```
POST /auth/refresh-token
```

**Headers:**

| Parameter | Value |
|-----------|-------|
| `username` | Forcepoint DLP admin username |
| `password` | Forcepoint DLP admin password (sent over HTTPS, no encryption needed) |

**Request Example:**
```bash
curl --location --request POST \
  "https://<IP>:<PORT>/dlp/rest/v1/auth/refresh-token" \
  --header "username: <username>" \
  --header "password: <password>"
```

**Response:**
```json
{
  "refresh_token": "<refresh_token>",
  "refresh_token_expires_in": <value>,
  "access_token": "<access_token>",
  "access_token_expires_in": <value>,
  "token_type": "JWT"
}
```

- Refresh token expires in **1 day** (default, configurable)
- Access token is also returned here to save an extra call

**To update refresh token expiration (SQL):**
```sql
UPDATE PA_CONFIG_PROPERTIES 
SET VALUE = '<value>', EXTRA_DATA = '<DAYS|HOURS|MINUTES>'
WHERE NAME = 'REFRESH_TOKEN_EXPIRATION' AND GROUP_NAME = 'SECURITY';
```

---

### 1.2 Get Access Token

```
POST /auth/access-token
```

**Headers:**

| Parameter | Value |
|-----------|-------|
| `refresh-token` | `Bearer <refresh_token>` |

**Request Example:**
```bash
curl --location --request POST \
  "https://<IP>:<PORT>/dlp/rest/v1/auth/access-token" \
  --header "refresh-token: Bearer <refresh_token>"
```

**Response:**
```json
{
  "access_token": "<JWT_access_token>",
  "access_token_expires_in": <value>,
  "token_type": "JWT"
}
```

- Access token expires in **15 minutes** (default, configurable)
- ⚠️ Refresh token cannot be used for API calls — returns `403`

**To update access token expiration (SQL):**
```sql
UPDATE PA_CONFIG_PROPERTIES 
SET VALUE = '<value>', EXTRA_DATA = '<DAYS|HOURS|MINUTES>'
WHERE NAME = 'ACCESS_TOKEN_EXPIRATION' AND GROUP_NAME = 'SECURITY';
```

**Status Codes:** `200` Success | `403` Forbidden

---

### 1.3 Standard Auth Headers (all subsequent APIs)

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## 2. Incident Management APIs

### 2.1 Get Incidents

```
POST /incidents
```

Returns max **10,000** incidents per response. Supports `INCIDENTS` (DLP) or `DISCOVERY` type — not both in same request.

**Input Parameters:**

| Name | Required | Supported | Valid Values |
|------|----------|-----------|--------------|
| `type` | ✅ Required | Both | `INCIDENTS`, `DISCOVERY` |
| `ids` | Conditional | Both | Array of IDs (max 1,000). If provided, filters are ignored. |
| `sort_by` | Optional | Both | `INSERT_DATE` |
| `from_date` | Conditional | Both | `"dd/MM/yyyy HH:mm:ss"` |
| `to_date` | Conditional | Both | `"dd/MM/yyyy HH:mm:ss"` |
| `detected_by` | Optional | Both | e.g. `"Endpoint Agent"` |
| `analyzed_by` | Optional | Both | e.g. `"Policy Engine 100190120a"` |
| `event_id` | Optional | Both | Numeric event ID |
| `destination` | Optional | INCIDENTS | e.g. `"Windows Portable Device (WPD)"` |
| `policies` | Optional | INCIDENTS | e.g. `"PCI"` |
| `action` | Optional | INCIDENTS | `AUDITED`, `QUARANTINED`, `BLOCKED`, `ENCRYPTED`, `RELEASED`, `ESG_ACTION`, `QUARANTINE_WITH_NOTE`, `UNSHARE_EXTERNAL`, `UNSHARE_ALL`, `UNSHARE_INTERNAL` |
| `source` | Optional | INCIDENTS | e.g. `"DESKTOP-3NG4NN6\\Lenovo"` |
| `status` | Optional | Both | `NEW`, `IN_PROCESS`, `CLOSE`, `FALSE_POSITIVE`, `ESCALATED`, or custom |
| `severity` | Optional | Both | `HIGH`, `MEDIUM`, `LOW` |
| `endpoint_type` | Optional | INCIDENTS | `LAPTOP`, `DESKTOP`, `NA` |
| `channel` | Optional | INCIDENTS | `EMAIL`, `ENDPOINT_EMAIL`, `FTP`, `HTTP`, `HTTPS`, `ENDPOINT_HTTP`, `ENDPOINT_HTTPS`, `ENDPOINT_PRINTING`, `ENDPOINT_APPLICATION`, `ENDPOINT_REMOVABLE_MEDIA`, `ENDPOINT_LAN`, `ENDPOINT_DISCOVERY`, `CASB_REAL_TIME`, `CASB_NEAR_REAL_TIME`, `CASB_DISCOVERY` |
| `assigned_to` | Optional | Both | Admin username |
| `tag` | Optional | Both | Tag name |
| `remove_ignored_incidents` | Optional | Both | `TRUE`, `FALSE` (default: `false`) |

**Request Examples:**

```bash
# By ID
curl --insecure -X POST "https://<IP>:<PORT>/dlp/rest/v1/incidents/" \
  --header "Authorization: Bearer <token>" \
  --header "Content-Type: application/json" \
  --data-raw '{"ids": [262458], "type": "INCIDENTS"}'

# By date range
--data-raw '{"type":"INCIDENTS","from_date":"31/10/2021 09:56:00","to_date":"08/11/2021 09:57:00"}'

# By action
--data-raw '{"type":"INCIDENTS","from_date":"01/08/2021 16:00:00","to_date":"12/08/2021 20:00:00","action":"BLOCKED"}'

# By severity
--data-raw '{"type":"INCIDENTS","from_date":"01/08/2021 16:00:00","to_date":"12/08/2021 20:00:00","severity":"MEDIUM"}'

# By status
--data-raw '{"type":"INCIDENTS","from_date":"01/08/2021 16:00:00","to_date":"12/08/2021 20:00:00","status":"NEW"}'

# By policy
--data-raw '{"type":"INCIDENTS","from_date":"01/08/2021 16:00:00","to_date":"12/08/2021 20:00:00","policies":"PCI"}'

# With sorting
--data-raw '{"sort_by":"INSERT_DATE","type":"INCIDENTS","from_date":"01/08/2021 16:00:00","to_date":"12/08/2021 20:00:00"}'

# Full filter example
--data-raw '{
  "sort_by": "INSERT_DATE", "type": "INCIDENTS",
  "from_date": "01/08/2021 16:00:00", "to_date": "12/08/2021 20:00:00",
  "detected_by": "Endpoint Agent", "analyzed_by": "Policy Engine 100190120a",
  "event_id": 5121411628328991975, "destination": "Windows Portable Device (WPD)",
  "policies": "PCI", "action": "BLOCKED", "source": "DESKTOP-3NG4NN6\\Lenovo",
  "status": "NEW", "severity": "MEDIUM", "endpoint_type": "LAPTOP",
  "channel": "ENDPOINT_REMOVABLE_MEDIA", "assigned_to": "admin", "tag": "my tag"
}'
```

**Response Structure:**

```json
{
  "incidents": [
    {
      "id": 373623,
      "severity": "HIGH",
      "action": "RELEASED",
      "tag": "Tag",
      "status": "Closed",
      "event_id": "7728775614896485765",
      "maximum_matches": 13,
      "transaction_size": 2632,
      "analyzed_by": "Policy Engine 1272021",
      "ignored_incidents": false,
      "event_time": "19/10/2021 10:12:02",
      "incident_time": "19/10/2021 10:12:02",
      "channel": "EMAIL",
      "policies": "Credit Cards; PCI",
      "partition_index": 20211019,
      "destination": "aaa@aaa.net",
      "detected_by": "Protector on 1272021",
      "released_incident": true,
      "violation_triggers": 2,
      "file_name": "visa.txt - 1.09 KB",
      "source": {
        "email_address": "test2@aaa.com"
      }
    }
  ],
  "total_count": 1,
  "total_returned": 1
}
```

**Response Fields — Incident Object:**

| Field | Supported | Description |
|-------|-----------|-------------|
| `id` | Both | Unique incident ID |
| `severity` | Both | HIGH / MEDIUM / LOW |
| `action` | Both | Action taken |
| `tag` | INCIDENTS | Incident tag |
| `status` | INCIDENTS | Current status |
| `destination` | INCIDENTS | Destination / email recipient |
| `details` | INCIDENTS | Subject/summary |
| `released_incident` | INCIDENTS | true/false |
| `event_id` | Both | Unique event ID |
| `maximum_matches` | Both | Threshold total matches |
| `transaction_size` | Both (by ID) | Forensic size |
| `assigned_to` | Both (by ID) | Assigned admin |
| `analyzed_by` | Both (by ID) | Policy engine |
| `ignored_incidents` | INCIDENTS | UI visibility flag |
| `event_time` | INCIDENTS | Event time |
| `incident_time` | Both | Incident creation time |
| `channel` | Both (filter) | Channel type |
| `policies` | Both | Triggered policy |
| `partition_index` | INCIDENTS | Table partition (use in update API) |
| `detected_by` | INCIDENTS | Detecting agent |
| `endpoint_type` | INCIDENTS | LAPTOP / DESKTOP / NA |
| `file_name` | INCIDENTS | Network incident file name |
| `file_path` | DISCOVERY | Discovery file path |
| `violation_triggers[]` | Both (by ID) | See Violation Trigger Object |
| `history[]` | Both (by ID) | See History Object |
| `sources[]` | Both (by ID) | See Source Object |

**Violation Trigger Object (by ID only):**

| Field | Description |
|-------|-------------|
| `policy_name` | Triggered policy name |
| `rule_name` | Triggered rule name |
| `classifiers[]` | `classifier_name`, `number_matches` |

**History Object (by ID only):**

| Field | Description |
|-------|-------------|
| `task_name` | Task performed |
| `comments` | Task comments |
| `admin_name` | Admin who performed action |
| `update_time` | Record creation time |
| `endpoint_confirmation` | `reason`, `message`, `justification` |

**Source Object:**

| Field | Supported |
|-------|-----------|
| `manager` | INCIDENTS |
| `department` | INCIDENTS |
| `ip_address` | INCIDENTS |
| `login_name` | INCIDENTS |
| `host_name` | Both (by ID) |
| `email_address` | INCIDENTS |
| `dn` | INCIDENTS |
| `nt_domain` | INCIDENTS |
| `risk_level` | INCIDENTS (if > 0) |
| `business_unit` | INCIDENTS |

**Status Codes:** `200` Success | `400` Bad Request | `403` Forbidden | `420` No incidents found

---

### 2.2 Update Incidents

```
POST /incidents/update
```

**Input Parameters:**

| Name | Required | Supported | Valid Values |
|------|----------|-----------|--------------|
| `type` | ✅ | Both | `INCIDENTS`, `DISCOVERY` |
| `action_type` | ✅ | Both | `STATUS`, `SEVERITY`, `ASSIGN_TO`, `ADD_COMMENT`, `TAG`, `RELEASE` (not DISCOVERY), `FALSE_POSITIVE` |
| `value` | ✅ (optional for ADD_COMMENT, RELEASE) | Both | STATUS: `NEW`,`IN_PROCESS`,`CLOSE`,`FALSE_POSITIVE`,`ESCALATED`,custom / SEVERITY: `HIGH`,`MEDIUM`,`LOW` / ASSIGN_TO: admin name / TAG: tag name (max 100 chars) / FALSE_POSITIVE: `1`(ignore), `0`(include) |
| `comment` | Conditional | Both | Required for ADD_COMMENT; supported for ASSIGN_TO, TAG, RELEASE, FALSE_POSITIVE |
| `scan_partitions` | Optional | INCIDENTS | `ALL` (scan all partitions), `NONE` (default, partition_index required), `LAST_ACTIVE` (last 2 partitions) |
| `event_ids` | Conditional | Both | Array of event IDs (max 1,000) |
| `incident_keys` | Conditional | Both | Array of `{incident_id, partition_index}` objects (max 1,000) |

**Request Examples:**

```bash
# Update by incident ID + partition_index
curl --insecure -X POST "https://<IP>:<PORT>/dlp/rest/v1/incidents/update" \
  --header "Authorization: Bearer <token>" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "incident_keys": [
      {"incident_id": 2719662, "partition_index": 20210831},
      {"incident_id": 2719665, "partition_index": 20210831}
    ],
    "type": "INCIDENTS",
    "action_type": "STATUS",
    "value": "NEW"
  }'

# With scan_partitions ALL
--data-raw '{
  "incident_keys": [{"incident_id": 132035}],
  "type": "INCIDENTS",
  "action_type": "STATUS",
  "value": "IN_PROCESS",
  "scan_partitions": "ALL"
}'

# With scan_partitions LAST_ACTIVE
--data-raw '{
  "incident_keys": [{"incident_id": 2185301}, {"incident_id": 2719665}],
  "type": "INCIDENTS",
  "action_type": "STATUS",
  "value": "NEW",
  "scan_partitions": "LAST_ACTIVE"
}'

# Update by event IDs (add tag)
--data-raw '{
  "event_ids": [9315711207487646059, 5758754422662242777],
  "type": "INCIDENTS",
  "action_type": "TAG",
  "value": "custom tag"
}'
```

**Response:** `200` returns empty body. `422` returns:
```json
{
  "unprocessed_ids": ["3624501111", "2659051111"]
}
```

**Status Codes:** `200` Success | `400` Bad Request | `403` Forbidden | `422` Not processed

---

## 3. Policy Management APIs

> ⚠️ Always backup the database before using Policy Management APIs. Some changes are irreversible.
> 
> ⚠️ Email and Web Quick Policies are **not supported**.
> 
> ⚠️ If the same policy name exists in both DLP and Discovery, export will fail.

---

### 3.1 GET Policy Level

```
GET /policy-levels/<data_type>
```

`data_type` must be `NETWORKING` or `DISCOVERY`.

**Request Example:**
```bash
curl --insecure -X GET \
  "https://<IP>:<PORT>/dlp/rest/v1/policy-levels/NETWORKING" \
  --header "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "policy_levels": [
    {"level": 1, "name": "Default level", "description": "Default level", "data_type": "NETWORKING"},
    {"level": 2, "name": "Developer", "description": "...", "data_type": "NETWORKING"},
    {"level": 3, "name": "Administrator", "description": "...", "data_type": "NETWORKING"}
  ]
}
```

**Status Codes:** `200` | `403` | `500`

---

### 3.2 PUT Policy Level (Create/Update)

```
POST /policy-levels/<data_type>
```

Request body format is the same as GET response body.

**Request Example:**
```bash
curl --insecure -X GET \
  "https://<IP>:<PORT>/dlp/rest/v1/policy-levels/NETWORKING" \
  --body '{
    "policy_levels": [{
      "level": 3,
      "name": "Administrators",
      "description": "Administrator access privileges",
      "data_type": "NETWORKING"
    }]
  }'
```

**Response:**
```json
{
  "update_results": [{
    "level_number": 3,
    "level_name": "Administrators",
    "description": "...",
    "status": "FAILED",
    "error_message": "Policy level/levels are missing. Levels must increment sequentially by 1."
  }]
}
```

**Status Codes:** `200` | `206` Partial | `400` | `422` | `500`

---

### 3.3 GET List of Enabled Policies

```
GET /policy/enabled-names?type=<policy_type>
```

`policy_type`: `DLP` or `DISCOVERY`

**Request Example:**
```bash
curl --insecure -X GET \
  "https://<IP>:<PORT>/dlp/rest/v1/policy/enabled-names?type=DLP" \
  --header "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "enabled_policies": ["Credit Cards", "CV in English DLP", "PCI Audit"],
  "total_enabled_policies": 3
}
```

**Status Codes:** `200` | `403` | `420` No enabled policies | `500`

---

### 3.4 GET Rules and Classifiers

```
GET /policy/rules?policyName=<policyName>
```

**Request Example:**
```bash
curl --insecure -X GET \
  "https://<IP>:<PORT>/dlp/rest/v1/policy/rules?policyName=CV in English DLP" \
  --header "Authorization: Bearer <token>"
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `policy_name` | String | Policy name |
| `enabled` | String | `"true"` / `"false"` |
| `description` | String | Policy description |
| `predefined_policy` | String | `"true"` / `"false"` |
| `predefined_policy_name` | String | Original predefined name |
| `dlp_version` | String | DLP version |
| `policy_level` | Object | `{level, data_type}` |
| `rules[]` | Array | Rule objects |
| `owners[]` | Array | Owner objects `{email, admin}` |

**Rule Object:**

| Field | Description |
|-------|-------------|
| `rule_name` | Rule name |
| `description` | Rule description |
| `display_description` | Confirmation dialogue text |
| `enabled` | `"true"` / `"false"` |
| `parts_count_type` | `CROSS_COUNT`, `INTERNAL_COUNT` |
| `condition_relation_type` | `AND`, `OR`, `CUSTOMIZED` |
| `custom_expression` | Required if CUSTOMIZED |
| `classifiers[]` | Classifier objects |

**Classifier Object:**

| Field | Values |
|-------|--------|
| `classifier_name` | Classifier name |
| `classifier_code_name` | For predefined classifiers |
| `predefined` | `"true"` / `"false"` |
| `position` | Integer |
| `similarity` | `DEFAULT`, `NARROW` (fingerprint) |
| `threshold_type` | `CHECK_EMPTY`, `CHECK_GREATER_THAN`, `CHECK_IN_RANGE`, `CHECK_LESS_THAN` |
| `threshold_value_from` | For CHECK_IN_RANGE & CHECK_GREATER_THAN |
| `threshold_value_to` | For CHECK_IN_RANGE |
| `threshold_calculate_type` | `UNIQUE`, `ALL` |
| `analyzed_specific_fields[]` | `SUBJECT`, `BODY`, `ATTACHMENT`, `FILE`, `BCC`, `CC`, `TO`, `FROM`, `SENT`, `PRIORITY`, `CONTENT_DESCRIPTOR`, `HTTP_HEADERS`, `METADATA`, `HTTP_GET`, `AGENT_DESTINATION`, `OTHER`, `BY_PASS_FIELD`, `FORENSICS`, `FORM_DATA`, `MIME_HEADERS`, `MESSAGE_ID`, `FORM_URL_ENCODED`, `MIME_X_HEADERS` |
| `analyzed_custom_header` | Only with MIME_HEADERS |
| `classifier_children[]` | Child classifier objects |

**Response Example:**
```json
{
  "dlp_version": "10.1.0",
  "policy_name": "CV in English DLP",
  "predefined_policy": "false",
  "description": "",
  "policy_level": {"level": 1, "data_type": "NETWORKING"},
  "rules": [{
    "rule_name": "CV in English",
    "enabled": "true",
    "parts_count_type": "CROSS_COUNT",
    "condition_relation_type": "AND",
    "classifiers": [{
      "classifier_name": "CV and Resume in English",
      "predefined": "true",
      "position": 1,
      "threshold_type": "CHECK_GREATER_THAN",
      "threshold_value_from": 1,
      "threshold_calculate_type": "UNIQUE"
    }]
  }]
}
```

**Status Codes:** `200` | `403` | `420` Policy not found | `500`

---

### 3.5 GET Rule Severity and Action

```
GET /policy/rules/severity-action?policyName=<policyName>
```

**Rule Object Fields:**

| Field | Values |
|-------|--------|
| `rule_name` | Rule name |
| `type` | `CUMULATIVE_CONDITION` (DLP only), `EVERY_MATCHED_CONDITION` |
| `max_matches` | `GREATEST_NUMBER`, `SUM_ALL` |
| `count_type` | `EVENTS`, `UNIQUE_MATCHES`, `MATCHES` (CUMULATIVE only) |
| `count_time_period` | `FIVE_MINUTES`, `FIFTEEN_MINUTES`, `THIRTY_MINUTES`, `ONE_HOUR`, `FOUR_HOURS`, `EIGHT_HOURS`, `TWENTY_FOUR_HOURS`, `THREE_DAYS`, `SEVEN_DAYS` |
| `count_time_period_window` | Same values as count_time_period |
| `classifier_details[]` | `{selected, number_of_matches, severity_type, action_plan}` |
| `risk_adaptive_protection_enabled` | `"true"` / `"false"` |
| `risk_adaptive_protection` | `{risk_level: 1-5, action_plan}` |

**Classifier Details:**

| Field | Values |
|-------|--------|
| `selected` | `"true"` / `"false"` |
| `number_of_matches` | Number |
| `severity_type` | `LOW`, `MEDIUM`, `HIGH` |
| `action_plan` | Action plan name |

**Response Example:**
```json
{
  "policy_name": "CV in English DLP",
  "rules": [{
    "rule_name": "CV in English",
    "type": "EVERY_MATCHED_CONDITION",
    "max_matches": "GREATEST_NUMBER",
    "classifier_details": [
      {"selected": "true", "number_of_matches": 0, "severity_type": "MEDIUM", "action_plan": "Audit Only"},
      {"selected": "false", "number_of_matches": 2, "severity_type": "MEDIUM", "action_plan": "Audit Only"}
    ],
    "risk_adaptive_protection_enabled": "false"
  }]
}
```

**Status Codes:** `200` | `403` | `420` | `500`

---

### 3.6 GET Source and Destination

```
GET /policy/rules/source-destination?policyName=<policyName>
```

> DLP policies only. Discovery policies do not have source/destination properties.

**Rule Object:** `{rule_name, rule_source, rule_destination}`

**Rule Source:**

| Field | Values |
|-------|--------|
| `endpoint_channel_machine_type` | `ALL_MACHINES`, `ALL_MACHINES_EXCEPT_LAPTOPS`, `LAPTOPS_ONLY` |
| `endpoint_connection_type` | `NONE`, `ANYWARE`, `CONNECTED_TO_CORPORATE_NETWORK`, `NOT_CONNECTED_TO_CORPORATE_NETWORK` |
| `resources[]` | Resource objects |

**Rule Destination:**

| Field | Values |
|-------|--------|
| `email_monitor_directions[]` | `INCOMING`, `OUTGOING`, `INTERNAL` |
| `channels[]` | Channel objects |

**Channel Object:**

| Field | Values |
|-------|--------|
| `channel_type` | `EMAIL`, `ENDPOINT_EMAIL`, `FTP`, `IM`, `HTTP`, `HTTPS`, `GENERIC_TEXT`, `ENDPOINT_HTTP`, `ENDPOINT_HTTPS`, `NETWORK_PRINTING`, `ENDPOINT_PRINTING`, `ENDPOINT_APPLICATION`, `ENDPOINT_REMOVABLE_MEDIA`, `ENDPOINT_LAN`, `MOBILE_AIRSYNC`, `EFSS`, `CASB_REAL_TIME`, `CASB_NEAR_REAL_TIME` |
| `enabled` | `"true"` / `"false"` |
| `user_operations[]` | `FILE_UPLOADING_ATTACHING`, `FILE_DOWNLOADING`, `UNRECOGNIZED_FILE_SHARING`, `EXTERNAL_FILE_SHARING` |
| `resources[]` | Resource objects |

**Resource Object:**

| Field | Values |
|-------|--------|
| `resource_name` | Resource name or user email |
| `type` | `DIRECTORY_ENTRY_USER`, `DIRECTORY_ENTRY_GROUP`, `DIRECTORY_ENTRY_OU`, `CUSTOM_USER`, `NETWORK`, `CUSTOM_COMPUTER`, `DOMAIN`, `BUSINESS_UNIT`, `APPLICATION_GROUP`, `ONLINE_APPLICATION_GROUP`, `PRINTER`, `DEVICE`, `COUNTRY`, `URL_CATEGORY`, `CLOUD_APPLICATION` |
| `include` | `"true"` (included), `"false"` (excluded) |

**Status Codes:** `200` | `403` | `420` | `500`

---

### 3.7 GET List of Rule Exceptions

```
GET /policy/rules/exceptions/all?type=<policy_type>
```

**Response:**
```json
{
  "exception_rules": [{
    "policy_name": "CV in English DLP",
    "rule_name": "CV in English",
    "exception_rule_names": ["custom"]
  }],
  "number_of_exception_rules": 1
}
```

**Status Codes:** `200` | `403` | `420` | `500`

---

### 3.8 GET Rule Exception Details

```
GET /policy/rules/exceptions?type=<policy_type>&ruleName=<rule_name>&policyName=<policy_name>
```

**Request Example:**
```bash
curl --insecure -X GET \
  "https://<IP>:<PORT>/dlp/rest/v1/policy/rules/exceptions?type=DLP&ruleName=CV in English" \
  --header "Authorization: Bearer <token>"
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `parent_policy_name` | Policy name |
| `parent_rule_name` | Rule holding exceptions |
| `policy_type` | `DLP`, `DISCOVERY` |
| `exception_rules[]` | Exception rule objects |

**Exception Rule Object:**

| Field | Values |
|-------|--------|
| `exception_rule_name` | Rule name |
| `enabled` | `"true"` / `"false"` |
| `parts_count_type` | `CROSS_COUNT`, `INTERNAL_COUNT` |
| `condition_relation_type` | `AND`, `OR`, `CUSTOMIZED` |
| `condition_enabled` | `"true"` / `"false"` |
| `source_enabled` | `"true"` / `"false"` (DLP only) |
| `destination_enabled` | `"true"` / `"false"` (DLP only) |
| `classifiers[]` | Classifier objects |
| `severity_action` | `{max_matches, classifier_details[]}` |
| `rule_source` | Rule source object |
| `rule_destination` | Rule destination object |

**Status Codes:** `200` | `403` | `420` | `500`

---

### 3.9 POST Rules and Classifiers (Create/Update)

```
POST /policy/rules
```

> Input is the output of GET `/policy/rules?policyName=<name>`

> ⚠️ API does not support "monitor all activities" rule condition.

**Request Example:**
```bash
curl --insecure -X POST \
  "https://<IP>:<PORT>/dlp/rest/v1/policy/rules" \
  --header "Authorization: Bearer <token>" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "dlp_version": "10.1.0",
    "policy_name": "CV in English DLP",
    "predefined_policy": "false",
    "description": "",
    "policy_level": {"level": 1, "data_type": "NETWORKING"},
    "rules": [{
      "rule_name": "CV in English",
      "enabled": "true",
      "parts_count_type": "CROSS_COUNT",
      "condition_relation_type": "AND",
      "classifiers": [{
        "classifier_name": "CV and Resume in English",
        "predefined": "true",
        "position": 1,
        "threshold_type": "CHECK_GREATER_THAN",
        "threshold_value_from": 1,
        "threshold_calculate_type": "UNIQUE"
      }]
    }]
  }'
```

**Status Codes:** `201` Created | `206` Partial | `400` | `403` | `409` Conflict | `500`

---

### 3.10 POST Rule Severity and Action (Update)

```
POST /policy/rules/severity-action
```

> Input is the output of GET `/policy/rules/severity-action?policyName=<name>`

**Request Example:**
```bash
--data-raw '{
  "policy_name": "CV in English DLP",
  "rules": [{
    "rule_name": "CV in English",
    "type": "EVERY_MATCHED_CONDITION",
    "max_matches": "GREATEST_NUMBER",
    "classifier_details": [
      {"selected": "true", "number_of_matches": 0, "severity_type": "MEDIUM", "action_plan": "Audit Only"},
      {"selected": "false", "number_of_matches": 2, "severity_type": "MEDIUM", "action_plan": "Audit Only"}
    ],
    "risk_adaptive_protection_enabled": "false"
  }]
}'
```

**Status Codes:** `201` | `400` | `403` | `409` | `420` | `500`

---

### 3.11 POST Rule Source and Destination (Update)

```
POST /policy/rules/source-destination
```

> Input is the output of GET `/policy/rules/source-destination?policyName=<name>`

**Request Example (abbreviated):**
```bash
--data-raw '{
  "policy_name": "CV in English DLP",
  "rules": [{
    "rule_name": "CV in English",
    "rule_source": {
      "endpoint_channel_machine_type": "ALL_MACHINES",
      "endpoint_connection_type": "ANYWARE"
    },
    "rule_destination": {
      "email_monitor_directions": ["OUTGOING"],
      "channels": [
        {"channel_type": "EMAIL", "enabled": "true"},
        {"channel_type": "HTTPS", "enabled": "true", "resources": [
          {"resource_name": "Excluded Resources", "type": "BUSINESS_UNIT", "include": "false"}
        ]},
        {"channel_type": "ENDPOINT_REMOVABLE_MEDIA", "enabled": "true"},
        {"channel_type": "CASB_REAL_TIME", "enabled": "false"}
      ]
    }
  }]
}'
```

**Status Codes:** `201` | `400` | `403` | `409` | `420` | `500`

---

### 3.12 POST Rule Exceptions (Create/Update)

```
POST /policy/rules/exceptions
```

> Input is the output of GET `/policy/rules/exceptions?type=<type>&ruleName=<name>`

**Request Example:**
```bash
--data-raw '{
  "parent_rule_name": "CV in English",
  "policy_type": "DLP",
  "exception_rules": [{
    "exception_rule_name": "custom",
    "enabled": "true",
    "description": "",
    "condition_enabled": "true",
    "source_enabled": "false",
    "destination_enabled": "false",
    "parts_count_type": "CROSS_COUNT",
    "condition_relation_type": "AND",
    "classifiers": [{
      "classifier_name": "credit",
      "predefined": "false",
      "position": 1,
      "threshold_type": "CHECK_GREATER_THAN",
      "threshold_value_from": 1,
      "threshold_calculate_type": "ALL"
    }],
    "severity_action": {
      "max_matches": "GREATEST_NUMBER",
      "classifier_details": [
        {"selected": "true", "number_of_matches": 0, "severity_type": "MEDIUM", "action_plan": "Audit Only"},
        {"selected": "false", "number_of_matches": 2, "severity_type": "MEDIUM", "action_plan": "Audit Only"}
      ]
    }
  }]
}'
```

**Status Codes:** `201` | `206` Partial | `400` | `403` | `409` | `420` | `500`

---

## 4. Deploy APIs

### 4.1 GET Deploy Status

```
GET /deploy/status
```

**Request Example:**
```bash
curl --insecure -X GET \
  "https://<IP>:<PORT>/dlp/rest/v1/deploy/status" \
  --header "Authorization: Bearer <token>"
```

**Response:**

| Field | Values |
|-------|--------|
| `dlp_version` | DLP version string |
| `deployment_status` | `IN_PROGRESS`, `PENDING_DEPLOYMENT`, `COMPLETED`, `FAILED` |

**Status Codes:** `200` | `403` | `500`

---

### 4.2 POST Deploy (Trigger Deployment)

```
POST /deploy
```

No input or output parameters.

**Request Example:**
```bash
curl --insecure -X POST \
  "https://<IP>:<PORT>/dlp/rest/v1/deploy" \
  --header "Authorization: Bearer <token>"
```

**Status Codes:**

| Code | Message |
|------|---------|
| `200` | Success |
| `204` | No Content (deploy not required) |
| `403` | Forbidden |
| `409` | Conflict (already deploying) |
| `500` | Internal server error |

---

## 5. Shared Object Schemas

### Policy Level Object

```json
{"level": 1, "data_type": "NETWORKING"}
```

### Classifier Object (GET/POST Rules)

```json
{
  "classifier_name": "Credit Cards",
  "predefined": "true",
  "position": 1,
  "threshold_type": "CHECK_GREATER_THAN",
  "threshold_value_from": 1,
  "threshold_calculate_type": "UNIQUE",
  "analyzed_specific_fields": ["BODY", "ATTACHMENT"]
}
```

### Resource Object

```json
{
  "resource_name": "Excluded Resources",
  "type": "BUSINESS_UNIT",
  "include": "false"
}
```

### Severity Action Object

```json
{
  "max_matches": "GREATEST_NUMBER",
  "classifier_details": [
    {"selected": "true", "number_of_matches": 0, "severity_type": "MEDIUM", "action_plan": "Audit Only"}
  ]
}
```

---

## 6. Status & Error Codes Reference

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `204` | No Content |
| `206` | Partial success |
| `400` | Bad request / input validation error |
| `403` | Forbidden (auth failed) |
| `409` | Conflict (deploy in progress / policy upgrade) |
| `420` | Resource not found |
| `422` | Unprocessable (incidents not updated) |
| `500` | Internal server error |

---

## 7. Troubleshooting

- **Application logs:** `Websense/Data Security/tomcat/logs/dlp/dlp-all.log`
- **Debug logs:** Enable under `Websense/Data Security/tomcat/lib/log4j-dlp.properties` → `#REST API` section
- **Special characters in query params:** Encode properly — see https://howto.caspio.com/tech-tips-and-articles/tech-parameters/using-special-characters-in-query-string/
- **Performance note:** Pulling 10,000 incidents (~25MB payload) takes approximately 1 minute. Actual performance depends on network latency and FSM workload.

---

## Quick Reference — API Endpoints

```
POST   /auth/refresh-token                          → Get refresh token
POST   /auth/access-token                           → Get access token

POST   /incidents                                   → Get incidents
POST   /incidents/update                            → Update incidents

GET    /policy-levels/<NETWORKING|DISCOVERY>        → Get policy levels
POST   /policy-levels/<NETWORKING|DISCOVERY>        → Create/update policy levels

GET    /policy/enabled-names?type=<DLP|DISCOVERY>   → List enabled policies
GET    /policy/rules?policyName=<name>              → Get rules & classifiers
GET    /policy/rules/severity-action?policyName=<n> → Get severity & action
GET    /policy/rules/source-destination?policyName=<n> → Get source & destination
GET    /policy/rules/exceptions/all?type=<type>     → List rule exceptions
GET    /policy/rules/exceptions?type=<t>&ruleName=<n>&policyName=<p> → Exception details

POST   /policy/rules                                → Create/update rules & classifiers
POST   /policy/rules/severity-action               → Update severity & action
POST   /policy/rules/source-destination            → Update source & destination
POST   /policy/rules/exceptions                    → Create/update exceptions

GET    /deploy/status                               → Get deploy status
POST   /deploy                                      → Trigger deployment
```
