package version

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
	version "github.com/yi-nology/rainbow_bridge/biz/model/version"
)

var (
	// Version information, injected at build time via main package
	AppVersion   = "dev"
	AppGitCommit = "unknown"
	AppBuildTime = "unknown"

	// GitHub repository information
	GitHubOwner = "yi-nology"
	GitHubRepo  = "rainbow_bridge"
)

// GitHubRelease represents the GitHub API release response
type GitHubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	PublishedAt time.Time `json:"published_at"`
	HTMLURL     string    `json:"html_url"`
	Prerelease  bool      `json:"prerelease"`
	Body        string    `json:"body"`
}

// GetVersion .
// @router /api/v1/version [GET]
func GetVersion(ctx context.Context, c *app.RequestContext) {
	var err error
	var req version.VersionRequest
	err = c.BindAndValidate(&req)
	if err != nil {
		c.String(consts.StatusBadRequest, err.Error())
		return
	}

	resp := &version.VersionResponse{
		OperateResponse: &common.OperateResponse{
			Code: consts.StatusOK,
			Msg:  "success",
		},
		VersionInfo: &version.VersionInfo{
			Version:   AppVersion,
			GitCommit: AppGitCommit,
			BuildTime: AppBuildTime,
		},
	}

	c.JSON(consts.StatusOK, resp)
}

// GetLatestRelease .
// @router /api/v1/version/latest [GET]
func GetLatestRelease(ctx context.Context, c *app.RequestContext) {
	var err error
	var req version.GitHubReleaseRequest
	err = c.BindAndValidate(&req)
	if err != nil {
		c.String(consts.StatusBadRequest, err.Error())
		return
	}

	// Fetch latest release from GitHub API
	releaseInfo, err := fetchLatestGitHubRelease(ctx)
	if err != nil {
		resp := &version.GitHubReleaseResponse{
			OperateResponse: &common.OperateResponse{
				Code:  consts.StatusInternalServerError,
				Msg:   "failed to fetch GitHub release",
				Error: err.Error(),
			},
		}
		c.JSON(consts.StatusOK, resp)
		return
	}

	resp := &version.GitHubReleaseResponse{
		OperateResponse: &common.OperateResponse{
			Code: consts.StatusOK,
			Msg:  "success",
		},
		ReleaseInfo: releaseInfo,
	}

	c.JSON(consts.StatusOK, resp)
}

func fetchLatestGitHubRelease(ctx context.Context) (*version.GitHubReleaseInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", GitHubOwner, GitHubRepo)

	httpCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(httpCtx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "rainbow-bridge")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &version.GitHubReleaseInfo{
		TagName:     release.TagName,
		Name:        release.Name,
		PublishedAt: release.PublishedAt.Format(time.RFC3339),
		HtmlUrl:     release.HTMLURL,
		Prerelease:  release.Prerelease,
		Body:        release.Body,
	}, nil
}
