/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { isEmpty } from 'lodash/fp';

import {
  EuiButtonIcon,
  EuiText,
  EuiHorizontalRule,
  EuiAvatar,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiToolTip,
} from '@elastic/eui';

import styled, { css } from 'styled-components';

import { ElasticUser } from '../../../containers/types';
import * as i18n from '../translations';

interface UserListProps {
  email: {
    subject: string;
    body: string;
  };
  headline: string;
  loading?: boolean;
  users: ElasticUser[];
  dataTestSubj?: string;
}

const MyAvatar = styled(EuiAvatar)`
  top: -4px;
`;

const MyFlexGroup = styled(EuiFlexGroup)`
  ${({ theme }) => css`
    margin-top: ${theme.eui.euiSizeM};
  `}
`;

const renderUsers = (
  users: ElasticUser[],
  handleSendEmail: (emailAddress: string | undefined | null) => void
) =>
  users.map(({ fullName, username, email }, key) => (
    <MyFlexGroup key={key} justifyContent="spaceBetween" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false}>
            <MyAvatar name={fullName ? fullName : username ?? ''} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip position="top" content={<p>{fullName ? fullName : username ?? ''}</p>}>
              <p>
                <strong>
                  <small data-test-subj="case-view-username">{username}</small>
                </strong>
              </p>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonIcon
          data-test-subj="user-list-email-button"
          onClick={handleSendEmail.bind(null, email)}
          iconType="email"
          aria-label={i18n.SEND_EMAIL_ARIA(fullName ? fullName : username ?? '')}
          isDisabled={isEmpty(email)}
        />
      </EuiFlexItem>
    </MyFlexGroup>
  ));

export const UserList: React.FC<UserListProps> = React.memo(
  ({ email, headline, loading, users, dataTestSubj }) => {
    const handleSendEmail = useCallback(
      (emailAddress: string | undefined | null) => {
        if (emailAddress && emailAddress != null) {
          window.open(
            `mailto:${emailAddress}?subject=${email.subject}&body=${email.body}`,
            '_blank'
          );
        }
      },
      [email.body, email.subject]
    );

    const filteredUsers = users.filter(({ username }) => username != null && username !== '');

    if (filteredUsers.length === 0) {
      return null;
    }

    return (
      <EuiText data-test-subj={dataTestSubj}>
        <h4>{headline}</h4>
        <EuiHorizontalRule margin="xs" />
        {loading && (
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiLoadingSpinner />
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
        {renderUsers(
          users.filter(({ username }) => username != null && username !== ''),
          handleSendEmail
        )}
      </EuiText>
    );
  }
);

UserList.displayName = 'UserList';
