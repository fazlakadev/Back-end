const mock = {
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
  AdminRank: { SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN' },
};

module.exports = mock;
