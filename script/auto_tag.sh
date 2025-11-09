#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

# Skip when running in non-interactive shells (e.g. CI)
if [[ ! -t 0 ]] || [[ "${CI:-}" == "true" ]]; then
	exit 0
fi

# If the current commit already has a semver tag, do nothing.
if git tag --points-at HEAD | grep -Eq '^v?[0-9]+\.[0-9]+\.[0-9]+$'; then
	exit 0
fi

TAG_PREFIX="${TAG_PREFIX:-v}"

function read_latest_tag() {
	local latest
	latest=$(git tag --list | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1 || true)
	if [[ -z "$latest" ]]; then
		latest="${TAG_PREFIX}0.0.0"
	fi
	echo "$latest"
}

function normalize_version() {
	local version=$1
	version=${version#v}
	version=${version#V}
	echo "$version"
}

function bump_version() {
	local base=$1
	local part=$2
	IFS='.' read -r major minor patch <<<"$(normalize_version "$base")"
	case "$part" in
	major)
		major=$((major + 1))
		minor=0
		patch=0
		;;
	minor)
		minor=$((minor + 1))
		patch=0
		;;
	patch)
		patch=$((patch + 1))
		;;
	*)
		echo "unknown bump part: $part" >&2
		return 1
		;;
	esac
	printf "%s%d.%d.%d\n" "$TAG_PREFIX" "$major" "$minor" "$patch"
}

function prompt_yes_no() {
	local prompt=$1
	local default=${2:-n}
	local value
	read -r -p "$prompt " value
	value=${value:-$default}
	if [[ "$value" =~ ^[Yy] ]]; then
		return 0
	fi
	return 1
}

LATEST_TAG=$(read_latest_tag)
MAJOR_CANDIDATE=$(bump_version "$LATEST_TAG" major)
MINOR_CANDIDATE=$(bump_version "$LATEST_TAG" minor)
PATCH_CANDIDATE=$(bump_version "$LATEST_TAG" patch)

echo "Last semantic tag: $LATEST_TAG"
if ! prompt_yes_no "Create a new tag for this commit? [y/N]"; then
	exit 0
fi

echo "Select tag type:"
echo "  1) Major release   -> $MAJOR_CANDIDATE"
echo "  2) Minor release   -> $MINOR_CANDIDATE"
echo "  3) Patch release   -> $PATCH_CANDIDATE"
echo "  4) Custom"
read -r -p "Choice [3]: " tag_choice
tag_choice=${tag_choice:-3}

NEW_TAG=""
case "$tag_choice" in
1)
	NEW_TAG=$MAJOR_CANDIDATE
	;;
2)
	NEW_TAG=$MINOR_CANDIDATE
	;;
3)
	NEW_TAG=$PATCH_CANDIDATE
	;;
4)
	read -r -p "Enter custom tag (e.g. v1.2.3): " custom_tag
	custom_tag=${custom_tag// /}
	if [[ ! "$custom_tag" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		echo "Invalid tag format. Expecting semver like v1.2.3" >&2
		exit 1
	fi
	NEW_TAG=$custom_tag
	;;
*)
	echo "Invalid choice." >&2
	exit 1
	;;
esac

if git rev-parse "$NEW_TAG" >/dev/null 2>&1; then
	echo "Tag $NEW_TAG already exists. Aborting." >&2
	exit 1
fi

if ! prompt_yes_no "Tag current commit as $NEW_TAG? [y/N]"; then
	exit 0
fi

git tag "$NEW_TAG"
echo "Created tag $NEW_TAG."

if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
	if prompt_yes_no "Push $NEW_TAG to origin now? [y/N]"; then
		git push origin "$NEW_TAG"
	fi
else
	echo "No upstream configured for current branch; skipping push question."
fi
