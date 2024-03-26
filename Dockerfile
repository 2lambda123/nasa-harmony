ARG BASE_IMAGE=node:18-buster
# Base of build ###################################################
FROM $BASE_IMAGE as base
RUN apt update && apt-get -y install sqlite3 python3 python3-pip python3-setuptools vim curl telnet
RUN pip3 install --upgrade pip awscli awscli-local
# Need to downgrade boto3 because there is a bug breaking creating SQS queues
RUN pip3 install boto3==1.25.5
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm config set store-dir ~/.pnpm-store


# Fetch dependencies ##############################################
FROM base as deps
WORKDIR /src
COPY ./pnpm-lock.yaml /src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
RUN pnpm add -g typescript turbo

# Prune projects ##################################################
FROM deps AS pruner
ARG PROJECT

WORKDIR /src
COPY . .
RUN turbo prune --scope="@harmony/${PROJECT}" --docker
# turbo prune misses the top-level tsconfig.base.json for some reason
COPY tsconfig.base.json /src/out/full

# Build the project ###############################################
FROM deps AS builder
WORKDIR /app

# Copy lockfile and package.json's of isolated subworkspace
COPY --from=pruner /src/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /src/out/json/ .

# Copy db directory
COPY --from=pruner /src/db/ /app/db

# Copy source code of isolated subworkspace and build it
COPY --from=pruner /src/out/full/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install -r --offline --prod --frozen-lockfile
RUN pnpm run -r bld

# Delete non-production node_modules and TypeScript source code
RUN yes | pnpm prune --prod --no-optional
RUN find /app -name "*.ts" -type f -delete

# Build the service image #########################################
FROM deps AS service
ARG PROJECT
ARG PORT=5000
RUN mkdir -p /tmp/metadata
WORKDIR "/$PROJECT/services/$PROJECT"
COPY --from=builder /app/ "/$PROJECT/"
# This is hacky, but it lets us use one target for all the services
# including harmony, without having the db directory in all the service images
RUN if [ "$PROJECT" != "harmony" ]; then rm -rf $PROJECT/db; else cp -rf /$PROJECT/db/* db; fi
RUN mkdir -p "/$PROJECT/bin"
COPY --from=pruner /src/bin/start-harmony-in-container "/$PROJECT/bin"
EXPOSE $PORT
CMD [ "node", "app/server.js" ]

