# Remote state of the production root, in the bucket of the platform. Each root has its own
# prefix and terraform-production can reach `production/` and `platform/`. Backend blocks cannot
# use variables, so the values are literal.
terraform {
  backend "gcs" {
    bucket = "pdlco-mytasks-tfstate"
    prefix = "production"
  }
}
