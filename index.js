
const core = require('@actions/core');
const axios = require('axios');

const {
  getPullRequestsToReview,
  getPullRequestsWithoutLabel,
  getPullRequestsReviewersCount,
  createPrArray,
  prettyMessage,
  stringToObject,
  getTeamsMentions,
  formatSlackMessage,
  formatTeamsMessage,
} = require('./functions');

const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_API_URL } = process.env;
const AUTH_HEADER = {
  Authorization: `token ${GITHUB_TOKEN}`,
};
const PULLS_ENDPOINT = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls`;


async function getPullRequestsNeedingReview(prs) {
  const issuesNeedingReview = (await axios({
    method: 'GET',
    url: `${GITHUB_API_URL}/search/issues`,
    params: {
      q: `is:pr state:open review:required repo:${GITHUB_REPOSITORY}`,
      sort: 'updated',
      order: 'desc',
      per_page: '100'
    },
    headers: AUTH_HEADER,
  })).data.items;

  console.log(JSON.stringify(issuesNeedingReview?.[0]));

  const prUrlsNeedingReview = issuesNeedingReview.map(issue => issue.pull_request.url);

  console.log(JSON.stringify(prUrlsNeedingReview?.[0]));


  return prs.filter(pr => prUrlsNeedingReview.includes(pr.url));
}

/**
 * Get Pull Requests from GitHub repository
 * @return {Promise} Axios promise
 */
async function getPullRequests() {
  return (await axios({
    method: 'GET',
    url: PULLS_ENDPOINT,
    params: {
      per_page: '100'
    },
    headers: AUTH_HEADER,
  })).data;
}

/**
 * Send notification to a channel
 * @param {String} webhookUrl Webhook URL
 * @param {String} messageData Message data object to send into the channel
 * @return {Promise} Axios promise
 */
async function sendNotification(webhookUrl, messageData) {
  return axios({
    method: 'POST',
    url: webhookUrl,
    data: messageData,
  });
}

/**
 * Main function for the GitHub Action
 */
async function main() {
  try {
    const webhookUrl = core.getInput('webhook-url');
    const provider = core.getInput('provider');
    const channel = core.getInput('channel');
    const github2providerString = core.getInput('github-provider-map');
    const ignoreLabel = core.getInput('ignore-label');
    core.info('Getting open pull requests...');
    const allPullRequests = await getPullRequests();

    const pullRequests = await getPullRequestsNeedingReview(allPullRequests);

    const totalReviewers = await getPullRequestsReviewersCount(pullRequests);
    core.info(`There are ${pullRequests.length} open pull requests and ${totalReviewers} reviewers`);
    const pullRequestsToReview = getPullRequestsToReview(pullRequests);
    const pullRequestsWithoutLabel = getPullRequestsWithoutLabel(pullRequestsToReview, ignoreLabel);
    core.info(`There are ${pullRequestsWithoutLabel.length} pull requests waiting for reviews`);
    if (pullRequestsWithoutLabel.length) {
      const prs = createPrArray(pullRequestsWithoutLabel);
      const github2provider = stringToObject(github2providerString);
      const messageText = prettyMessage(prs, github2provider, provider);
      let messageObject;
      switch (provider) {
        case 'slack':
          messageObject = formatSlackMessage(channel, messageText);
          break;
        case 'msteams': {
          throw new Error('msteams unsupported in this fork');
        }
      }
      console.log(JSON.stringify(messageObject));

      // await sendNotification(webhookUrl, messageObject);
      core.info(`Notification sent successfully!`);
    }
  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
}

main();

