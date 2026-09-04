window.EZDEPLOY_CATALOG_SNAPSHOT = Object.freeze({
  "schemaVersion": 1,
  "generatedAt": "2026-09-03T18:48:13.438Z",
  "source": {
    "type": "Azure Cognitive Services regional Models API",
    "command": "az cognitiveservices model list",
    "referenceSubscription": true
  },
  "regions": [
    "eastus2",
    "swedencentral"
  ],
  "warnings": [],
  "models": [
    {
      "key": "anthropic|claude-haiku-4-5|2",
      "format": "Anthropic",
      "name": "claude-haiku-4-5",
      "version": "2",
      "publisher": "Anthropic",
      "family": "haiku",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-haiku-4-5.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-haiku-4-5.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-haiku-4-5|20251001",
      "format": "Anthropic",
      "name": "claude-haiku-4-5",
      "version": "20251001",
      "publisher": "Anthropic",
      "family": "haiku",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-haiku-4-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-haiku-4-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-4-5|20251101",
      "format": "Anthropic",
      "name": "claude-opus-4-5",
      "version": "20251101",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-4-6|1",
      "format": "Anthropic",
      "name": "claude-opus-4-6",
      "version": "1",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2027-02-02T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-6",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-02-02T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2027-02-02T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-6",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-02-02T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-4-7|1",
      "format": "Anthropic",
      "name": "claude-opus-4-7",
      "version": "1",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2027-04-06T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-7",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-04-06T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2027-04-06T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-7",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-04-06T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-4-8|1",
      "format": "Anthropic",
      "name": "claude-opus-4-8",
      "version": "1",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2027-09-01T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-8",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-09-01T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2027-09-01T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-8",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-09-01T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-4-8|2",
      "format": "Anthropic",
      "name": "claude-opus-4-8",
      "version": "2",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2027-09-01T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-8.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-09-01T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2027-09-01T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-4-8.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-09-01T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-5|1",
      "format": "Anthropic",
      "name": "claude-opus-5",
      "version": "1",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2027-07-08T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-07-08T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2027-07-08T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-07-08T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-opus-5|2",
      "format": "Anthropic",
      "name": "claude-opus-5",
      "version": "2",
      "publisher": "Anthropic",
      "family": "opus",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2027-07-08T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-5.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-07-08T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2027-07-08T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-opus-5.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-07-08T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-sonnet-4-5|20250929",
      "format": "Anthropic",
      "name": "claude-sonnet-4-5",
      "version": "20250929",
      "publisher": "Anthropic",
      "family": "sonnet",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-4-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2026-10-19T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-4-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2026-10-19T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-sonnet-4-6|1",
      "format": "Anthropic",
      "name": "claude-sonnet-4-6",
      "version": "1",
      "publisher": "Anthropic",
      "family": "sonnet",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2027-02-10T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-4-6",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-02-10T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": null
          },
          "deprecationDate": "2027-02-10T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-4-6",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-02-10T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-sonnet-5|1",
      "format": "Anthropic",
      "name": "claude-sonnet-5",
      "version": "1",
      "publisher": "Anthropic",
      "family": "sonnet",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2027-06-30T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-06-30T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": false,
          "capabilities": {
            "hostedOn": "anthropic"
          },
          "deprecationDate": "2027-06-30T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-5",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-06-30T00:00:00+00:00"
            }
          ]
        }
      }
    },
    {
      "key": "anthropic|claude-sonnet-5|2",
      "format": "Anthropic",
      "name": "claude-sonnet-5",
      "version": "2",
      "publisher": "Anthropic",
      "family": "sonnet",
      "capabilities": {
        "chatCompletion": true
      },
      "regions": {
        "eastus2": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2027-06-30T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-5.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-06-30T00:00:00+00:00"
            }
          ]
        },
        "swedencentral": {
          "lifecycle": "GA",
          "isDefaultVersion": true,
          "capabilities": {
            "hostedOn": "azure"
          },
          "deprecationDate": "2027-06-30T00:00:00Z",
          "skus": [
            {
              "name": "GlobalStandard",
              "usageName": "AIServices.GlobalStandard.claude-sonnet-5.Azure",
              "capacity": {
                "maximum": 1000000,
                "default": 10
              },
              "deprecationDate": "2027-06-30T00:00:00+00:00"
            }
          ]
        }
      }
    }
  ]
});
