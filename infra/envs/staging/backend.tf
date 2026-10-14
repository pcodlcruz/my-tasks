# Remote state of the staging root, in the bucket of the platform (production project). Each
# root has its own prefix and terraform-staging can only reach this one. Backend blocks cannot
# use variables, so the values are literal.
terraform {
  backend "gcs" {
    bucket = "pdlco-mytasks-tfstate"
    prefix = "staging"
  }
}
