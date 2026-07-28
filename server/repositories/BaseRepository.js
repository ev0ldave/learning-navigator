/**
 * Repository interfaces - Interface Segregation + Dependency Inversion.
 *
 * Consumers depend on the narrowest capability they need:
 *  - ReadRepository  : query-only access (find/count)
 *  - WriteRepository : read + mutations (create/update/delete)
 *
 * The concrete Mongoose model is never exposed via a getter, so callers cannot
 * bypass the abstraction.
 */

/**
 * ReadRepository - query-only surface.
 */
class ReadRepository {
  constructor(model) {
    this.model = model;
  }

  async findById(id, options = {}) {
    let query = this.model.findById(id);
    if (options.populate) {
      options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    if (options.select) {
      query = query.select(options.select);
    }
    return query.exec();
  }

  async findOne(filter, options = {}) {
    let query = this.model.findOne(filter);
    if (options.populate) {
      options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    if (options.select) {
      query = query.select(options.select);
    }
    return query.exec();
  }

  async find(filter, options = {}) {
    let query = this.model.find(filter);
    if (options.sort) {
      query = query.sort(options.sort);
    }
    if (options.skip) {
      query = query.skip(options.skip);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.populate) {
      options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    if (options.select) {
      query = query.select(options.select);
    }
    return query.exec();
  }

  async count(filter) {
    return this.model.countDocuments(filter);
  }
}

/**
 * WriteRepository - read + mutation surface.
 * Extends ReadRepository so a writer is always a valid reader (Liskov).
 */
class WriteRepository extends ReadRepository {
  async create(data) {
    const entity = new this.model(data);
    return entity.save();
  }

  async updateById(id, data) {
    return this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async updateOne(filter, data) {
    return this.model.findOneAndUpdate(filter, data, { new: true });
  }

  async updateMany(filter, data) {
    return this.model.updateMany(filter, data);
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  async deleteMany(filter) {
    return this.model.deleteMany(filter);
  }
}

// BaseRepository remains the full read+write repository for backward
// compatibility with existing concrete repositories.
module.exports = WriteRepository;
module.exports.ReadRepository = ReadRepository;
module.exports.WriteRepository = WriteRepository;
