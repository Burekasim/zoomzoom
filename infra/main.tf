terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Backend config (bucket/key/region) supplied at init time via -backend-config.
  # Local runs work without it; CI passes the values.
  backend "s3" {}
}

provider "aws" {
  profile = var.aws_profile == "" ? null : var.aws_profile
  region  = var.aws_region

  default_tags {
    tags = {
      Project = "zoomzoom"
      Repo    = "Burekasim/zoomzoom"
    }
  }
}

provider "aws" {
  alias   = "us_east_1"
  profile = var.aws_profile == "" ? null : var.aws_profile
  region  = "us-east-1"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name = "zoomzoom"
}
