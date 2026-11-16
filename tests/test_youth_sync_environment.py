import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("sync_environment", Path(__file__).parents[1] / "scripts/validate_youth_sync_environment.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_reviewed_staging_and_approved_production_targets():
    module.validate_environment("staging", "https://h43-youth-api-staging.synthetic.workers.dev", "synthetic")
    module.validate_environment("production", "https://h43-youth-api-production.synthetic.workers.dev/", "synthetic", True)


@pytest.mark.parametrize("environment,url,subdomain,approved", [
    ("staging", "https://h43-youth-api-production.synthetic.workers.dev", "synthetic", False),
    ("production", "https://h43-youth-api-production.synthetic.workers.dev", "synthetic", False),
    ("production", "https://h43-youth-api-staging.synthetic.workers.dev", "synthetic", True),
    ("staging", "https://h43-youth-api-staging.other.workers.dev", "synthetic", False),
    ("staging", "http://h43-youth-api-staging.synthetic.workers.dev", "synthetic", False),
    ("staging", "https://user:secret@h43-youth-api-staging.synthetic.workers.dev", "synthetic", False),
    ("staging", "https://h43-youth-api-staging.synthetic.workers.dev/path", "synthetic", False),
    ("staging", "https://h43-youth-api-staging.synthetic.workers.dev?token=x", "synthetic", False),
    ("unreviewed", "https://h43-youth-api-staging.synthetic.workers.dev", "synthetic", False),
])
def test_unreviewed_or_cross_environment_targets_are_rejected(environment, url, subdomain, approved):
    with pytest.raises(ValueError):
        module.validate_environment(environment, url, subdomain, approved)
