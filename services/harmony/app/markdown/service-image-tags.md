### <a name="service-image-tags-details"></a> Managing Service Image Tags (Versions)

Using the `service-image-tag` endpoint, service providers can manage the versions of their services deployed to an environment. Note that a user must be a member of either the EDL `Harmony Service Deployers`
group or the EDL `Harmony Admin` group to access this endpoint, and requests to this endpoint _must_ include
an EDL bearer token header, .e.g., `Authorization: Bearer <token>`.

#### Get backend service tag (version) information for all services

```

GET {{root}}/service-image-tag

```
**Example {{exampleCounter}}** - Getting backend service image tags using the `service-image-tag` API

The returned JSON response is a map of canonical service names to tags:

```JSON
{
  "service-runner": "latest",
  "harmony-gdal-adapter": "latest",
  "hybig": "latest",
  "harmony-service-example": "latest",
  "harmony-netcdf-to-zarr": "latest",
  "harmony-regridder": "latest",
  "swath-projector": "latest",
  "hoss": "latest",
  "sds-maskfill": "latest",
  "trajectory-subsetter": "latest",
  "podaac-concise": "sit",
  "podaac-l2-subsetter": "sit",
  "podaac-ps3": "latest",
  "podaac-netcdf-converter": "latest",
  "query-cmr": "latest",
  "giovanni-adapter": "latest",
  "geoloco": "latest"
}
```
---
**Example {{exampleCounter}}** - Harmony `service-image-tags` response

#### Get backend service tag (version) information for a specific service

```

GET {{root}}/service-image-tag/#canonical-service-name

```
**Example {{exampleCounter}}** - Getting a specific backend service image tag using the `service-image-tags` API

The returned JSON response is a map with a single `tag` field:

```JSON
{
  "tag": "1.2.3"
}
```
---
**Example {{exampleCounter}}** - Harmony `service-image-tags` response for a single service

#### Update backend service tag (version) for a specific service

```

PUT {{root}}/service-image-tag/#canonical-service-name

```
**Example {{exampleCounter}}** - Updating a specific backend service image tag using the `service-image-tags` API

The body of the `PUT` request should be a JSON object of the same form as the single service `GET` response in the
example above:

```JSON
{
  "tag": "new-version"
}
```

The returned JSON response is the same as the single service request above, indicating the new tag value

```JSON
{
  "tag": "new-version"
}
```
---
**Example {{exampleCounter}}** - Harmony `service-image-tags` response for a updating a single service


**Important** from the [Docker documentation](https://docs.docker.com/engine/reference/commandline/image_tag/):
>A tag name may contain lowercase and uppercase characters, digits, underscores, periods and dashes. A tag name may not start with a period or a dash and may contain a maximum of 128 characters.

#### Get the current enable/disable state of the service deployment feature

```

GET {{root}}/service-image-tag/state

```
**Example {{exampleCounter}}** - Getting the current enable/disable state of the service deployment feature using the `service-image-tag` API

The returned JSON response shows if the service deployment is currently enabled (true) or disabled (false):

```JSON
{
  "enabled": true
}
```
---
**Example {{exampleCounter}}** - Harmony `service-image-tags` response for enable/disable state

#### Enable the service deployment feature
The user must have admin permission in order to invoke this endpoint.

```

PUT {{root}}/service-image-tag/enable

```
**Example {{exampleCounter}}** - Enable the service deployment feature using the `service-image-tag` API

The returned JSON response shows if the service deployment is currently enabled:

```JSON
{
  "enabled": true
}
```
---
**Example {{exampleCounter}}** - Harmony `service-image-tags` response for enabling the service deployment

#### Disable the service deployment feature
The user must have admin permission in order to invoke this endpoint.

```

PUT {{root}}/service-image-tag/disable

```
**Example {{exampleCounter}}** - Disable the service deployment feature using the `service-image-tag` API

The returned JSON response shows the service deployment is currently disabled:

```JSON
{
  "enabled": false
}
```
---
**Example {{exampleCounter}}** - Harmony `service-image-tags` response for disabling the service deployment