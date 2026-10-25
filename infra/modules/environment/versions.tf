terraform {
  required_version = ">= 1.9, < 2.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6.0"
    }
    # Only for Firebase Hosting (hosting.tf): the GA provider has no google_firebase_hosting_*
    # resources. Pinned to the same line as google; see infra/README.md.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.6.0"
    }
  }
}
