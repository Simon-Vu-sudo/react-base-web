Feature: Role-based access control

  Scenario Outline: the navigation reflects the signed-in role
    Given I am signed in as "<role>"
    Then I should see the "Devices" navigation item
    And I should <visibility> the "Users" navigation item

    Examples:
      | role     | visibility |
      | admin    | see        |
      | operator | not see    |
      | viewer   | not see    |

  Scenario Outline: the device delete button is admin only
    Given I am signed in as "<role>"
    And I am on the "Devices" page
    Then I should <visibility> a delete button for device "Line Sensor 1"

    Examples:
      | role     | visibility |
      | admin    | see        |
      | operator | not see    |
      | viewer   | not see    |

  Scenario Outline: opening a device's settings page depends on role
    Given I am signed in as "<role>"
    When I visit "/devices/d1/settings"
    Then I should see the "<heading>" heading

    Examples:
      | role     | heading       |
      | admin    | Settings      |
      | operator | Settings      |
      | viewer   | Not permitted |

  Scenario: a viewer redirected away from device settings still sees the sidebar
    Given I am signed in as "viewer"
    When I visit "/devices/d1/settings"
    Then I should be on "/forbidden"
    And the sidebar should still be visible

  Scenario Outline: the admin users page is admin only
    Given I am signed in as "<role>"
    When I visit "/admin/users"
    Then I should see the "<heading>" heading

    Examples:
      | role     | heading       |
      | admin    | Users         |
      | operator | Not permitted |
      | viewer   | Not permitted |
