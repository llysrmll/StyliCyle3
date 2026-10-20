<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only', 405);

$d = body();
$first  = trim($d['firstName'] ?? '');
$middle = trim($d['middleName'] ?? '');
$last   = trim($d['lastName'] ?? '');
$age    = (int)($d['age'] ?? 0);
$email  = strtolower(trim($d['email'] ?? ''));
$pass   = $d['password'] ?? '';
$role   = $d['role'] ?? 'user';

if ($first === '' || $last === '' || $email === '') fail('Please fill in all required fields.');
if (!filter_var($email, FILTER_VALIDATE_EMAIL))     fail('Invalid email address.');
if ($age <= 0)                                      fail('Please enter a valid age.');
if (strlen($pass) < 6)                              fail('Password must be at least 6 characters.');
if ($role === 'admin')                              fail('Admin accounts can only be created by an existing administrator.', 403);
if ($role !== 'user')                               fail('Please select a valid account type.');

$check = $pdo->prepare('select 1 from users where email = ?');
$check->execute([$email]);
if ($check->fetch()) fail('That email is already registered.', 409);

$stmt = $pdo->prepare(
    'insert into users (first_name, middle_name, last_name, age, email, password, role)
     values (?, ?, ?, ?, ?, ?, ?) returning id'
);
$stmt->execute([$first, $middle ?: null, $last, $age, $email, password_hash($pass, PASSWORD_DEFAULT), 'user']);

out(['ok' => true, 'id' => $stmt->fetchColumn()]);
