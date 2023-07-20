# Crypto.com task 1
### Infrastructure:
1. Decribe infrastructure in terraform(aws provider). It means create 2 VPC's with RDS, Loadbalancer, opensearch, cloudfront and EKS cluster, subnets etc. in each(staging, production).
2. Gitlab cloud
3. Gitlab cloud docker registry
4. Sentry cloud (frontend/backend error tracking)
5. OPTIONAL! It would be good to have Vault to store our credentials and use it in Terraform and Helm. But this is another long story)
### Version Control System (VCS):
I would like to use the gitlab cloud solution. 
Create 3 repo’s:
1. Frontend
2. Backend
3. Terraform(aws resources)
4. Monitoring(it will be helm chart with dependencies as: prometheus-operator, grafana, node exporters and alertmanager with necessary configuration(values.yaml) for each environment(cluster) - staging and production.

Put aws credentials(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) in gitlab-ci settings to hide
Define AWS_CLOUDFRONT_STAGING_DISTRIBUTION_ID, AWS_CLOUDFRONT_PRODUCTION_DISTRIBUTION_ID and AWS_DEFAULT_REGION.
### Continuous Integration (CI) Server:
According to step 1, we are going to use gitlab-ci for the automation process. All pipelines will trigger on push and automated by default.
I defined the next stages with variables:
##### Frontend:
```sh
stages:
  - test
  - build
  - deploy_staging
  - deploy_production
 
variables:
  # we can put these variables into gitlab-ci settings, but this is not sensitive data, so I kept it here
  AWS_CLOUDFRONT_STAGING_DISTRIBUTION_ID: "<your_staging_cloudfront_distribution_id>"
  AWS_CLOUDFRONT_PRODUCTION_DISTRIBUTION_ID: "<your_production_cloudfront_distribution_id>"
  AWS_DEFAULT_REGION: "<your_aws_region>"
```
##### Backend:
To make our pipeline working we need to put KUBE_CONFIG to gitlab-ci settings.
```sh
stages:
  - test
  - build
  - deploy_staging
  - e2e_tests
  - deploy_production
 
variables:
  IMAGE_NAME: "<your_docker_registry>/<your_backend_app_name>"
  HELM_CHART_NAME: "backend-app"
  STAGING_ENV_NAME: "staging"
  PRODUCTION_ENV_NAME: "production"
```
### Build Stage:
#### Frontend:
Build artifact and store it in gitlab-ci 30 days(rollback possibility).
```sh
build:
  stage: build
  image: node:latest
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - build
    expire_in: 30 days
```
#### Backend:
### Testing Stage:
#### Frontend:
In stage "test" we have 3 parallel jobs. Of course we should have prepared unit-tests and ui-tests:
```sh
unit_testing:
  stage: test
  image: node:latest
  script:
    - npm install
    - npm run test

linting:
  stage: test
  image: node:latest
  script:
    - npm install
    - npm run lint

ui_testing:
  stage: test
  image: cypress/browsers:node14.17.0-chrome93-ff89
  script:
    - npm install
    - npm run test:ui
```
#### Backend:
Almost the same as in frontend pipeline(unit tests, lint checks)
```sh
unit_testing:
  stage: test
  image: node:latest
  script:
    - npm install
    - npm test

# Linting stage
linting:
  stage: test
  image: node:latest
  script:
    - npm install
    - npm run lint
```
### Containerization (Optional):
#### Frontend:
We use aws cloudfront instead of usual k8s frontend application, so we don't need this step. But in case of using k8s I add step "build_docker_image" and we add this step after "build".
Ofc, we have to change our deployment step in this case and create Helm chart for our frontend application.
#### Backend:
We need to have in repo Dockerfile for build our image:
and gitlab stage(we will use gitlab-ci variables like $CI_COMMIT_SHORT_SHA to tag our images):
```sh
build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $IMAGE_NAME:$CI_COMMIT_SHORT_SHA .
```
### Deployment Stage:
#### Frontend:
Deployment steps, stagings and production. We just need to upload our frontend artifact to cloudfront and invalidate cloudfront cache. Of course we need to separate this steps and the best solution from my opinion is:
1. automated deploy to dev
2. at least manual dev testing. Better to have one more test step on dev with ui-testing between dev and prod deploy.
3. Manual deploy to prod or automated deploy depending on successfull tests on dev.
```
deploy_staging:
  stage: deploy_staging
  image: python:3.8
  script:
    - apt-get update -qy
    - apt-get install -y python3-pip
    - pip3 install awscli
    - npm install
    - npm run build
    - aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
    - aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
    - aws configure set default.region $AWS_DEFAULT_REGION
    - aws s3 sync build/ s3://<your_staging_cloudfront_s3_bucket>
    - aws cloudfront create-invalidation --distribution-id $AWS_CLOUDFRONT_STAGING_DISTRIBUTION_ID --paths "/*"
  only:
    - branches

deploy_production:
  stage: deploy_production
  image: python:3.8
  script:
    - apt-get update -qy
    - apt-get install -y python3-pip
    - pip3 install awscli
    - npm install
    - npm run build
    - aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
    - aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
    - aws configure set default.region $AWS_DEFAULT_REGION
    - aws s3 sync build/ s3://<your_production_cloudfront_s3_bucket>
    - aws cloudfront create-invalidation --distribution-id $AWS_CLOUDFRONT_PRODUCTION_DISTRIBUTION_ID --paths "/*"
  only:
    - tags
```
#### Backend:
We need to have helm chart definition in our backend repo, for example in path /helm/chart:
```sh
deploy_staging:
  stage: deploy_staging
  image: bitnami/kubectl:latest
  script:
    - echo "$KUBE_CONFIG" | base64 -d > kubeconfig.yaml
    - export KUBECONFIG=kubeconfig.yaml
    - kubectl config set-context $(kubectl config current-context) --namespace=$STAGING_ENV_NAME
    - helm upgrade --install $HELM_CHART_NAME ./helm/chart \
        --set image.repository=$IMAGE_NAME \
        --set image.tag=$CI_COMMIT_SHORT_SHA \
        --set envName=$STAGING_ENV_NAME
  only:
    - branches
```
Run e2e tests on our staging environment to unblock deploy to production:
```sh
# Run end-to-end tests on the staging environment
e2e_tests:
  stage: e2e_tests
  image: node:latest
  script:
    # e2e might be written on random framework, lets image we have the code it runs here
```
After successfuly running tests on dev deploy to production unblocks and we can manually deploy it. Or if we sure in our tests, this step might be automated:
```sh
# Deploy to EKS production environment for Git tags
deploy_production:
  stage: deploy_production
  image: bitnami/kubectl:latest
  script:
    - echo "$KUBE_CONFIG" | base64 -d > kubeconfig.yaml
    - export KUBECONFIG=kubeconfig.yaml
    - kubectl config set-context $(kubectl config current-context) --namespace=$PRODUCTION_ENV_NAME
    - helm upgrade --install $HELM_CHART_NAME ./path/to/your/helm/chart \
        --set image.repository=$IMAGE_NAME \
        --set image.tag=$CI_COMMIT_TAG \
        --set envName=$PRODUCTION_ENV_NAME
  only:
    - tags
  when: manual
  dependencies:
    - e2e_tests
```
### Monitoring and Error Reporting:
1. As I mentioned in p. Preparation, I would use Sentry cloud for error reporting(frontend and backend), just need to provide Sentry cdn of necessary project to our application(depends on environment).
2. I would like to use k8s prometheus-operator, grafana, exporters and alertmanager for monitoring our infrastructure and applications. At least we should have basic infra alerts like: eks nodes resources monitoring, storage, RDS. If our backend application provide any metrics it would be good to understand when our product degrading(for example: http errors count). Ofc we should use alertmanager to notify dev teams|support about the problems, It might be at least alerting to slack, but the better way is Opsgenie|Squadcast with Incident Management process.
Also we can use VictoriaMetrics(for example) as cold storage with downsampling for long term.
3. Logging. Opensearch for storing, viewing and fluentbit for collecting logs from our backend application(docker logs).

### Rolling deployment strategy
According to CI/CD description in previous steps, to rollback our application we just need to choose previous pipeline and rerun deploy step to prod or staging environment.

