# Remote state of the platform root. The bucket was created during the phase 3 bootstrap
# (T043, see infra/RUNBOOK.md) and is adopted by this root in T051 with prevent_destroy.
# Backend blocks cannot use variables, so the values are literal.
terraform {
  backend "gcs" {
    bucket = "pdlco-mytasks-tfstate"
    prefix = "platform"
  }
}
