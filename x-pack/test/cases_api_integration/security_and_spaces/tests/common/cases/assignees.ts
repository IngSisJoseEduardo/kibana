/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { findCasesResp, getPostCaseRequest, postCaseReq } from '../../../../common/lib/mock';
import {
  createCase,
  getCase,
  findCases,
  updateCase,
  deleteAllCaseItems,
} from '../../../../common/lib/utils';

import { suggestUserProfiles } from '../../../../common/lib/user_profiles';

import { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { bulkGetUserProfiles } from '../../../../common/lib/user_profiles';
import { superUser } from '../../../../common/lib/authentication/users';

// eslint-disable-next-line import/no-default-export
export default ({ getService }: FtrProviderContext): void => {
  const es = getService('es');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const supertest = getService('supertest');

  describe('assignees', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('allows the assignees field to be an empty array', async () => {
      const postedCase = await createCase(supertest, getPostCaseRequest());

      expect(postedCase.assignees).to.eql([]);
    });

    it('allows creating a case without the assignees field in the request', async () => {
      const postReq = getPostCaseRequest();
      const { assignees, ...restRequest } = postReq;

      const postedCase = await createCase(supertest, restRequest);

      expect(postedCase.assignees).to.eql([]);
    });

    it('assigns a user to a case and retrieves the users profile', async () => {
      const profile = await suggestUserProfiles({
        supertest: supertestWithoutAuth,
        req: {
          name: 'delete',
          owners: ['securitySolutionFixture'],
          size: 1,
        },
        auth: { user: superUser, space: 'space1' },
      });

      const postedCase = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: [{ uid: profile[0].uid }],
        })
      );

      const retrievedProfiles = await bulkGetUserProfiles({
        supertest,
        req: {
          uids: postedCase.assignees.map((assignee) => assignee.uid),
          dataPath: 'avatar',
        },
      });

      expect(retrievedProfiles[0]).to.eql(profile[0]);
    });

    it('assigns multiple users to a case and retrieves their profiles', async () => {
      const profiles = await suggestUserProfiles({
        supertest: supertestWithoutAuth,
        req: {
          name: 'only',
          owners: ['securitySolutionFixture'],
          size: 2,
        },
        auth: { user: superUser, space: 'space1' },
      });

      const postedCase = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: profiles.map((profile) => ({ uid: profile.uid })),
        })
      );

      const retrievedProfiles = await bulkGetUserProfiles({
        supertest,
        req: {
          uids: postedCase.assignees.map((assignee) => assignee.uid),
          dataPath: 'avatar',
        },
      });

      expect(retrievedProfiles).to.eql(profiles);
    });

    it('assigns a user to a case and retrieves the users profile from a get case call', async () => {
      const profile = await suggestUserProfiles({
        supertest: supertestWithoutAuth,
        req: {
          name: 'delete',
          owners: ['securitySolutionFixture'],
          size: 1,
        },
        auth: { user: superUser, space: 'space1' },
      });

      const postedCase = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: [{ uid: profile[0].uid }],
        })
      );

      const retrievedCase = await getCase({ caseId: postedCase.id, supertest });

      const retrievedProfiles = await bulkGetUserProfiles({
        supertest,
        req: {
          uids: retrievedCase.assignees.map((assignee) => assignee.uid),
          dataPath: 'avatar',
        },
      });

      expect(retrievedProfiles[0]).to.eql(profile[0]);
    });

    it('filters cases using the assigned user', async () => {
      const profile = await suggestUserProfiles({
        supertest: supertestWithoutAuth,
        req: {
          name: 'delete',
          owners: ['securitySolutionFixture'],
          size: 1,
        },
        auth: { user: superUser, space: 'space1' },
      });

      await createCase(supertest, postCaseReq);
      const caseWithDeleteAssignee1 = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: [{ uid: profile[0].uid }],
        })
      );
      const caseWithDeleteAssignee2 = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: [{ uid: profile[0].uid }],
        })
      );

      const cases = await findCases({
        supertest,
        query: { assignees: [profile[0].uid] },
      });

      expect(cases).to.eql({
        ...findCasesResp,
        total: 2,
        cases: [caseWithDeleteAssignee1, caseWithDeleteAssignee2],
        count_open_cases: 2,
      });
    });

    it("filters cases using the assigned users by constructing an or'd filter", async () => {
      const profileUidsToFilter = await suggestUserProfiles({
        supertest: supertestWithoutAuth,
        req: {
          name: 'only',
          owners: ['securitySolutionFixture'],
          size: 2,
        },
        auth: { user: superUser, space: 'space1' },
      });

      await createCase(supertest, postCaseReq);
      const caseWithDeleteAssignee1 = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: [{ uid: profileUidsToFilter[0].uid }],
        })
      );
      const caseWithDeleteAssignee2 = await createCase(
        supertest,
        getPostCaseRequest({
          assignees: [{ uid: profileUidsToFilter[1].uid }],
        })
      );

      const cases = await findCases({
        supertest,
        query: { assignees: [profileUidsToFilter[0].uid, profileUidsToFilter[1].uid] },
      });

      expect(cases).to.eql({
        ...findCasesResp,
        total: 2,
        cases: [caseWithDeleteAssignee1, caseWithDeleteAssignee2],
        count_open_cases: 2,
      });
    });

    it('updates the assignees on a case', async () => {
      const profiles = await suggestUserProfiles({
        supertest: supertestWithoutAuth,
        req: {
          name: 'delete',
          owners: ['securitySolutionFixture'],
          size: 1,
        },
        auth: { user: superUser, space: 'space1' },
      });

      const postedCase = await createCase(supertest, getPostCaseRequest());

      const patchedCases = await updateCase({
        supertest,
        params: {
          cases: [
            {
              id: postedCase.id,
              version: postedCase.version,
              assignees: [{ uid: profiles[0].uid }],
            },
          ],
        },
      });

      const retrievedProfiles = await bulkGetUserProfiles({
        supertest,
        req: {
          uids: patchedCases[0].assignees.map((assignee) => assignee.uid),
          dataPath: 'avatar',
        },
      });

      expect(retrievedProfiles).to.eql(profiles);
    });
  });
};
