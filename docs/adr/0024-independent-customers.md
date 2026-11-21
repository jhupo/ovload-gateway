# ADR 0024: Independent relay customers and platform management access

Status: accepted for implementation.

Ovload is an LLM distribution relay. Each customer has an independent login,
model keys, wallet, usage and execution ceilings. A tenant ID is an internal
customer data partition. It does not represent an organization. Team invitations,
membership roles, shared team wallets, departure and ownership transfer are not
product requirements. Management roles belong only to platform operators.

The existing platform resource routes keep their resource paths, but require a
live management identity session and a live platform-scoped permission. They
reject imported administrator sessions, deployment API keys, customer sessions,
model bearer keys and implicit internal-plugin administrator contexts. Browser
writes require the configured Origin and session CSRF proof. Plugins retain
their declared narrow host capabilities; internal HTTP dispatch cannot mint
global platform authority. Unknown resource families are denied by default.

Provider inventory, egress and public group catalogs remain platform resources.
Customer keys, wallet reads, billing operations and customer usage derive their
scope from verified identity. The API never accepts a caller-selected customer
scope for an own-resource route. Platform resource authorization linearizes at
the live request check; identity, security and customer financial mutations
also revalidate their actor inside the owning transaction.

Platform mutation audit records distinguish management principals from imported
administrator IDs. Existing immutable historical records retain their original
identity. Neither an identity alias nor an automatic mapping of old credentials
grants access to the new boundary.

Model automatic retail charging remains disabled by explicit user choice. The
funds transaction service is separate from model execution. Payment processing,
subscriptions and referral business are independent of this identity work.
